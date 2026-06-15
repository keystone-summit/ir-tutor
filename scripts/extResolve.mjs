// ESM resolve hook: append ".js" to extensionless relative imports so the
// Next.js route/lib files (which rely on webpack's extensionless resolution)
// can be imported by plain Node for the one-time local seed.
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z0-9]+$/i.test(specifier)) {
    try {
      return await next(specifier + ".js", context);
    } catch {
      // fall through to default resolution
    }
  }
  return next(specifier, context);
}
