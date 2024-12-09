describe("a", function () {
    it("should pass", function () {
        // ...
    });
});
describe('b', function () {
    it('should pass, then fail', function () {
        process.nextTick(function () {
            throw new Error('uncaught!!');
        });
    });
});
describe("c", function () {
    it("should fail", function () {
        throw new Error("Oh no!");
    });
});