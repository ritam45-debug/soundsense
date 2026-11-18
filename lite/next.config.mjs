// Static export: the whole app is plain files (HTML/JS/CSS) that run in the visitor's browser.
// On GitHub Pages the site lives under /<repo-name>, so the workflow sets NEXT_PUBLIC_BASE_PATH.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** @type {import('next').NextConfig} */
export default {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
