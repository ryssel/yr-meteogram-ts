import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "ha-card/src/meteogram-card.ts",
  output: {
    file: "ha-card/dist/meteogram-card.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: false,
      compilerOptions: {
        target: "es2020",
        module: "es2020",
        lib: ["es2020", "dom", "dom.iterable"],
        declaration: false,
      },
    }),
  ],
  external: ["custom-card-helpers"],
};
