// HTML file imports (bundled as strings by rollup)
declare module "*.html" {
  const content: string;
  export default content;
}
