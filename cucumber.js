export default {
  default: {
    import: [
      './tsx-register.js',
      'features/step_definitions/**/*.ts',
      'features/support/**/*.ts'
    ],
    paths: ['features/**/*.feature'],
    format: ['summary', 'progress'],
    publishQuiet: true
  }
};
