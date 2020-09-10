import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from 'rollup-plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

const plugins = [
  nodeResolve(),
  commonjs({
    include: 'node_modules/**',
  }),
];

if (process.env.NODE_ENV == 'production') {
  plugins.push(terser());
}

const watch = {
  clearScreen: false,
};

export default [
  {
    input: "./examples/basic-topology/src/index.js",
    output: {
      file: "./examples/basic-topology/bundle.js",
      format: "iife"
    },
    plugins,
    watch,
  },
  {
    input: "./examples/how-tables-work/src/index.js",
    output: {
      file: "./examples/how-tables-work/bundle.js",
      format: "iife"
    },
    plugins,
    watch,
  }
];
