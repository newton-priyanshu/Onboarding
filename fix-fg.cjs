const fs = require('fs');
const path = require('path');

const dir = 'src/pages/worksheets';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx')).map(f => path.join(dir, f));

let fixedCount = 0;

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  const orig = c;
  
  // Remove _fgIdCounter declaration line
  c = c.replace(/^let _fgIdCounter = 0;\n/gm, '');
  c = c.replace(/^let _fgIdCounter = 0;\r\n/gm, '');
  
  // Fix htmlFor template literal - exact pattern from the files
  c = c.replace(/htmlFor=\{id \|\| `fg-\$\{\+\+_fgIdCounter\}`\}/g, 'htmlFor={id || undefined}');
  
  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf8');
    console.log('Fixed: ' + f);
    fixedCount++;
  }
});

console.log('Done. Fixed ' + fixedCount + ' of ' + files.length + ' files.');
