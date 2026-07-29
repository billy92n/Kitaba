export default {
  test: {
    environment: "node",
    include: ["src/integration-tests/**/*.test.ts"],
    globals: true,
    fileParallelism: false,
  },
};
