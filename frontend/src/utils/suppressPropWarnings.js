// Dev-only: suppress known false-positive prop-type noise after react-is is aligned.
// Real prop mistakes should still surface (messages that do not match these patterns).

if (import.meta.env.DEV) {
  const originalError = console.error;

  const suppressPatterns = [
    /Warning: Failed prop type: Invalid prop.*(children|icon|startIcon|endIcon).*supplied/,
    /Warning: Failed prop type: Invalid prop.*of type.*object.*supplied/,
    /Warning: PageHeroHeader: Support for defaultProps will be removed/,
  ];

  const formatArgs = (args) =>
    args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return String(arg);
        } catch {
          return '';
        }
      })
      .join(' ');

  console.error = (...args) => {
    const message = formatArgs(args);
    if (suppressPatterns.some((pattern) => pattern.test(message))) {
      return;
    }
    originalError.apply(console, args);
  };
}
