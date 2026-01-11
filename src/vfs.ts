import fs from "fs";

export interface VirtualFileSystem {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    append(path: string, content: string): Promise<void>;
}

export class RealFileSystemImpl implements VirtualFileSystem {
    path: String

    constructor(path: string) {
        this.path = path;
    }

    async read(path: string): Promise<string> {
        return fs.readFileSync(path, 'utf8');
    }

    async write(path: string, content: string): Promise<void> {
        fs.writeFileSync(path, content);
    }

    async append(path: string, content: string): Promise<void> {
        fs.appendFileSync(path, content);
    }

}

export class InMemoryFileSystemImpl implements VirtualFileSystem{
    data: Record<string, string> = {};
    constructor() {

    }

    async write(path: string, content: string): Promise<void> {
        this.data[path] = content;
    }

    async read(path: string): Promise<string> {
        return this.data[path];
    }

    async append(path: string, content: string): Promise<void> {
        this.data[path] += "\n";
        this.data[path] += content;
    }

}
