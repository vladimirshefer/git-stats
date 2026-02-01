export class AsyncGeneratorUtil {
    static async * of<T>(items: T[]): AsyncGenerator<T> {
        for (const item of items) {
            yield item;
        }
    }

    static async* flatMap<T, R>(items: AsyncGenerator<T>, mapper: (item: T) => AsyncGenerator<R>): AsyncGenerator<R> {
        for await (const item of items) {
            yield* mapper(item);
        }
    }

    static async * union<T>(sources: AsyncIterable<T>[]): AsyncGenerator<T> {
        for (const source of sources) {
            yield* source;
        }
    }

    static async* map<T, R>(source: AsyncIterable<T>, mapper: (item: T) => R): AsyncGenerator<R> {
        for await (const item of source) {
            yield mapper(item);
        }
    }

    static async* peek<T>(source: AsyncIterable<T>, consumer: (item: T) => void): AsyncGenerator<T> {
        for await (const item of source) {
            consumer(item);
            yield item;
        }
    }

    static async collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
        const result: T[] = [];
        const iterator = source[Symbol.asyncIterator]();

        return new Promise((resolve, reject) => {
            function step(): void {
                iterator.next()
                    .then(({ value, done }) => {
                        if (done) {
                            resolve(result);
                        } else {
                            result.push(value);
                            step();
                        }
                    })
                    .catch(reject);
            }
            step();
        });
    }
}

export interface AsyncGeneratorWrapper<T> {
    get(): AsyncGenerator<T>

    map<R>(mapper: (item: T) => R): AsyncGeneratorWrapper<R>

    flatMap<R>(mapper: (item: T) => AsyncGenerator<R>): AsyncGeneratorWrapper<R>

    forEach(consumer: (item: T) => void | Promise<void>): Promise<void>

    chunked(size: number): AsyncGeneratorWrapper<T[]>
}

class AsyncIteratorWrapperImpl<T> implements AsyncGeneratorWrapper<T> {
    private readonly source: AsyncGenerator<T>

    constructor(source: AsyncGenerator<T>) {
        this.source = source;
    }

    chunked(size: number): AsyncGeneratorWrapper<T[]> {
        return streamOf(this.__chunked(size))
    }

    async * __chunked(size: number): AsyncGenerator<T[]> {
        let chunk: T[] = [];
        for await (const item of this.source) {
            chunk.push(item);
            if (chunk.length === size) {
                yield chunk;
                chunk = [];
            }
        }
        if (chunk.length > 0) {
            yield chunk;
        }
    }

    get(): AsyncGenerator<T> {
        return this.source;
    }

    map<R>(mapper: (item: T) => R): AsyncGeneratorWrapper<R> {
        return streamOf<R>((async function* <T, R>(source: AsyncIterable<T>, mapper: (item: T) => R): AsyncGenerator<R> {
            for await (const item of source) {
                yield mapper(item);
            }
        })(this.source, mapper))
    }

    flatMap<R>(mapper: (item: T) => AsyncGenerator<R>): AsyncGeneratorWrapper<R> {
        return streamOf(AsyncGeneratorUtil.flatMap(this.source, mapper))
    }

    async forEach(consumer: (item: T) => void | Promise<void>): Promise<void> {
        for await (const item of this.source) {
            await consumer(item);
        }
    }
}

export function streamOf<T>(source: AsyncGenerator<T>): AsyncGeneratorWrapper<T> {
    return new AsyncIteratorWrapperImpl<T>(source);
}

export namespace stream {
    export function ofArrayPromise<T>(p: Promise<T[]>): AsyncGeneratorWrapper<T> {
        async function* __ofArrayPromise<T>(p: Promise<T[]>): AsyncGenerator<T> {
            const items = await p;
            for (const item of items) {
                yield item;
            }
        }
        return streamOf(__ofArrayPromise(p))
    }



}
