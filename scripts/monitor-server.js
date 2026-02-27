const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "127.0.0.1";
const port = 3330;
const filePath = path.join(__dirname, "..", "apps", "monitor", "index.html");

const server = http.createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  try {
    const html = fs.readFileSync(filePath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message);
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Monitor UI at http://${host}:${port}`);
});
