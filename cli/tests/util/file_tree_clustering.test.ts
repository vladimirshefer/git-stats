import {clusterFiles} from "../../src/util/file_tree_clustering";

function testClustering(files: string[][], clusterMaxSize: number, clusterMinSize: number) {
    let clustered = clusterFiles(files.flatMap(it => it).sort(_ => Math.random() - 0.5), clusterMaxSize, clusterMinSize);
    expect(clustered.map(it => it.files)).toStrictEqual(files);
}

describe('test cluster files', () => {
    it('empty list', () => {
        const files: string[] = []
        let clustered = clusterFiles(files, 10, 1);
        expect(clustered.map(it => it.files)).toStrictEqual([]);
    });

    it('single file', () => {
        testClustering([[
            "src/main/java/Foo.java"
        ]], 10, 1);
    });

    it('multiple files', () => {
        const files = [[
            "src/main/java/Bar.java",
            "src/main/java/Baz.java",
            "src/main/java/Foo.java",
            "src/main/resources/config.properties",
        ], [
            "src/test/java/BarTest.java",
            "src/test/java/BazTest.java",
            "src/test/java/FooTest.java",
        ], [
            ".gitignore"
        ]]
        testClustering(files, 4, 2)
    })

    it('per file', () => {
        const files = [[
            "src/main/java/Bar.java",
            "src/main/java/Baz.java",
            "src/main/java/Foo.java",
            "src/main/java/Iop.java",
            "src/main/java/Jkl.java",
            "src/main/java/Mko.java",
            "src/main/java/Xyz.java",
        ]]
        testClustering(files, 2, 1)
    })

    it('different depth', () => {
        const files = [[
            "src/main/java/foo/bar/Foo.java",
            "src/main/java/foo/bar/Bar.java",
            "src/main/java/foo/bar/Baz.java",
            "src/main/java/foo/bar/Xyz.java",
        ], [
            "src/main/java/buz/Iop.java",
            "src/main/java/fgh/Jkl.java",
            "src/Mko.java",
        ]]
        testClustering(files, 5, 2)
    })

    it('many leftovers', () => {
        const files = [[
            "d0/d1/d2/d3/F4.java",
            "d0/d1/d2/d3/d4/F5.java",
            "d0/d1/d2/d3/d4/d5/F6.java",
            "d0/d1/d2/d3/d4/d5/d6/F7.java",
            "d0/d1/d2/d3/d4/d5/d6/d7/F8.java",
        ], [
            "d0/d1/F2.java",
            "d0/d1/d2/F3.java",
        ], [
            "F0.java",
            "d0/F1.java",
        ]];
        testClustering(files, 5,2)
    })
});
