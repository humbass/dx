export default function sigint() {
  setTimeout(() => process.exit(0), 100)
}
