export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',      // Feature
        'fix',       // Bug fix
        'hotfix',    // Hotfix (critical production fix)
        'docs',      // Documentation
        'style',     // Code style (formatting, missing semicolons, etc.)
        'refactor',  // Code refactoring
        'perf',      // Performance improvement
        'test',      // Adding or updating tests
        'chore',     // Build, dependencies, CI/CD
        'ci',        // CI/CD configuration
      ],
    ],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lowercase'],
    'type-empty': [2, 'never'],
  },
};
