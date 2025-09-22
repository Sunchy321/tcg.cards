import tsEslint from 'typescript-eslint';
import rootConfig from '../../eslint.config.mjs';

export default tsEslint.config(
    ...rootConfig,
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],

        languageOptions: {
            parserOptions: {
                project:         './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },

        extends: [tsEslint.configs.recommendedTypeChecked],

        rules: {
            '@typescript-eslint/switch-exhaustiveness-check': [
                'error',
                {
                    requireDefaultForNonUnion: true,
                },
            ],
        },
    },
);
