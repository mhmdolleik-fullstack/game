// Post-build: inline JS into HTML for Android WebView compatibility
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'build');
const htmlPath = path.join(outDir, 'index.html');

const html = fs.readFileSync(htmlPath, 'utf8');

// Find the external script tag
const m = html.match(/<script[^>]*src="\.\/([^"]+)"[^>]*><\/script>/);
if (!m) { console.log('No external script found'); process.exit(0); }

const jsPath = path.join(outDir, m[1]);
const js = fs.readFileSync(jsPath, 'utf8');
console.log('Inlining ' + m[1] + ' (' + Math.round(js.length/1024) + ' KB)');

// Build output by splitting the HTML at the script tag position
const tagStart = html.indexOf(m[0]);
const tagEnd = tagStart + m[0].length;

const before = html.substring(0, tagStart);
const after = html.substring(tagEnd);

// Escape </script in the JS (use </scr\ipt workaround)
let safe = js;
// Replace all variations of </script with safe versions
while (safe.indexOf('<\/script') !== -1) {
  safe = safe.replace('<\/script', '<\\/script');
}
while (safe.indexOf('</script') !== -1) {
  safe = safe.replace('</script', '<\\/script');
}
while (safe.indexOf('</SCRIPT') !== -1) {
  safe = safe.replace('</SCRIPT', '<\\/SCRIPT');
}
while (safe.indexOf('</Script') !== -1) {
  safe = safe.replace('</Script', '<\\/Script');
}

// Remove modulepreload from the 'after' portion
const cleanAfter = after.replace(/<link[^>]*modulepreload[^>]*>/g, '');

// Concatenate manually — no String.replace with $ patterns
const output = before + '<script>' + safe + '<' + '/script>' + cleanAfter;

fs.writeFileSync(htmlPath, output, 'utf8');

// Delete the JS file
try { fs.unlinkSync(jsPath); } catch(e) {}
try { fs.rmdirSync(path.join(outDir, 'assets')); } catch(e) {}

// Final verification
const final = fs.readFileSync(htmlPath, 'utf8');
const count = (final.match(/<\/script>/g) || []).length;
console.log('Final: ' + Math.round(final.length/1024) + ' KB, </script> tags: ' + count + ' (must be 1)');
if (count !== 1) {
  console.error('ERROR: Still have extra </script> tags!');
  process.exit(1);
}
