export default [
  {
    ignores: ["dist/**", "node_modules/**", "release/**"],
  },
  {
    files: ["src/**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {},
  },
];
