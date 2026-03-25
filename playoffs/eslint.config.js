export default [
    {
        files: ["**/*.js", "**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                $: "readonly", // jQuery
                document: "readonly", // Browser globals
                window: "readonly",
                prompt: "readonly",
                fetch: "readonly",
                setTimeout: "readonly"
            }
        },
        rules: {
            "semi": ["warn", "always"],
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
        }
    }
];
