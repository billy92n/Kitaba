export default {
  test: {
    environment: "node",
    include: ["src/benchmarks/**/*.ts"],
    globals: true,
    fileParallelism: false,
  },
};
