import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'src/pages/worksheets');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

const correctFGBody = `function FG({ label, required, id, children }) {
  return <div className="form-group"><label className="form-label" htmlFor={id || undefined}>{label}{required && <span style={{ color: 'var(--md-error)', marginLeft: '3px' }}>*</span>}</label>
    {children}
  </div>;
}`;

// Also remove any orphan _fgIdCounter lines
let fixedCount = 0;

files.forEach(f => {
  const fpath = path.join(dir, f);
  let c = fs.readFileSync(fpath, 'utf8');
  const orig = c;
  
  // Remove orphan _fgIdCounter lines
  c = c.replace(/let _fgIdCounter = 0;\n?/g, '');
  
  // Fix FG function if it has the broken empty body
  c = c.replace(/function FG\(\{ label, required, id, children \}\) \{\n?\}/g, correctFGBody);
  
  // Also fix FG if it still has the old auto-generated ID pattern
  c = c.replace(/htmlFor=\{id \|\| `fg-\$\{\+\+_fgIdCounter\}`\}/g, 'htmlFor={id || undefined}');
  
  if (c !== orig) {
    fs.writeFileSync(fpath, c, 'utf8');
    console.log('Fixed: ' + f);
    fixedCount++;
  }
});

console.log('Done. Fixed ' + fixedCount + ' of ' + files.length + ' files.');
