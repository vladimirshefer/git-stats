export class AsyncGeneratorUtil {
    static async* flatMap<T, R>(items: T[], mapper: (item: T) => AsyncGenerator<R>): AsyncGenerator<R> {
        for (const item of items) {
            yield* mapper(item);
        }
    }

}
