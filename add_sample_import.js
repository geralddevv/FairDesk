const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'routes', 'fairdesk_route.js');
let content = fs.readFileSync(filePath, 'utf8');
const target = 'import Counter from "../models/system/counter.js";';
const replacement = 'import Counter from "../models/system/counter.js";\r\nimport Sample from "../models/inventory/sample.js";';
if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Done: Sample import added.');
} else {
  console.log('Target not found — check manually.');
}
