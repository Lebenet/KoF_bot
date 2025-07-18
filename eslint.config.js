const js = require("@eslint/js");
const eslintConfigPrettier = require("eslint-config-prettier/flat");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
        },
        rules: {
            "arrow-spacing": ["warn", { before: true, after: true }],
            "brace-style": ["error", "1tbs", { allowSingleLine: true }],
            "comma-dangle": ["error", "always-multiline"],
            "comma-spacing": "error",
            "comma-style": "error",
            curly: ["error", "multi-line", "consistent"],
            "dot-location": ["error", "property"],
            "handle-callback-err": "off",
            indent: ["error", 4],
            "keyword-spacing": "error",
            "max-nested-callbacks": ["error", { max: 4 }],
            "max-statements-per-line": ["error", { max: 2 }],
            "no-console": "off",
            "no-empty-function": "warn",
            "no-floating-decimal": "error",
            "no-lonely-if": "warn",
            "no-multiple-empty-lines": [
                "error",
                { max: 2, maxEOF: 1, maxBOF: 0 },
            ],
            "no-shadow": ["error", { allow: ["err", "resolve", "reject"] }],
            "no-trailing-spaces": ["error"],
            "no-var": "error",
            "no-undef": "off",
            "no-unused-vars": "warn",
            "object-curly-spacing": ["error", "always"],
            "prefer-const": "error",
            semi: ["error", "always"],
            "space-before-blocks": "error",
            "space-before-function-paren": [
                "error",
                {
                    anonymous: "never",
                    named: "never",
                    asyncArrow: "always",
                },
            ],
            "space-in-parens": "warn",
            "space-infix-ops": "error",
            "space-unary-ops": "error",
            "spaced-comment": "warn",
            yoda: "error",
        },
    },
    eslintConfigPrettier,
];
