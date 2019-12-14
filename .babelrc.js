module.exports = {
  plugins: ["macros"],
  presets: [
    ["@babel/preset-env", { targets: { node: true } }],
    "@babel/preset-typescript"
  ]
};
