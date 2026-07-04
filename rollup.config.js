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
      // Only compile the card + shared app sources; keep vite.config.ts and
      // other project files out of the bundle (avoids spurious TS warnings).
      include: ["ha-card/src/**/*.ts", "src/**/*.ts"],
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
