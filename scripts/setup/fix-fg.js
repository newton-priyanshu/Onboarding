const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('src/pages/worksheets/*.jsx');

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  const orig = c;
  
  // Remove _fgIdCounter declarations
  c = c.replace(/let _fgIdCounter = 0;\n/g, '');
  c = c.replace(/let _fgIdCounter = 0;\r\n/g, '');
  
  // Fix htmlFor with backtick template literals
  c = c.replace(/htmlFor=\{id \|\| `fg-\$\{__fgIdCounter\}`\}/g, 'htmlFor={id || undefined}');
  c = c.replace(/htmlFor=\{id \|\| `fg-\$\{\+\+_fgIdCounter\}`\}/g, 'htmlFor={id || undefined}');
  
  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf8');
    console.log('Fixed: ' + f);
  }
});

console.log('Done. Checked ' + files.length + ' files.');
