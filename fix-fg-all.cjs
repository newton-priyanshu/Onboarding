const fs = require('fs');
const path = require('path');

const files = [
  'Phase1Worksheet5.jsx', 'Phase1Worksheet6.jsx', 'Phase1Worksheet7.jsx', 'Phase1Worksheet8.jsx',
  'Phase2Worksheet1.jsx', 'Phase2Worksheet2.jsx', 'Phase2Worksheet3.jsx', 'Phase2Worksheet4.jsx',
  'Phase3Worksheet1.jsx', 'Phase3Worksheet2.jsx', 'Phase3Worksheet3.jsx', 'Phase3Worksheet4.jsx', 'Phase3Worksheet5.jsx'
];

const FG_DEF = `const FG = ({ label, required, id, children }) => <div className="form-group"><label className="form-label" htmlFor={id || undefined}>{label}${''}{required && <span style={{ color: 'var(--md-error)', marginLeft: '3px' }}>*</span>}</label>{children}</div>;\n`;

let count = 0;
for (const f of files) {
  const fp = path.join(__dirname, 'src/pages/worksheets', f);
  let c = fs.readFileSync(fp, 'utf8');
  
  // Check if FG is already defined (function FG or const FG)
  if (/function FG\b|const FG\b/.test(c)) {
    console.log(`SKIP: ${f} already has FG definition`);
    continue;
  }
  
  // Add FG before the first helper component definition
  // Helpers are typically defined after the main component as const H = ..., const C = ..., etc.
  // Or as function Header(, function Card(, etc.
  const beforeHelpers = c.replace(
    /(\nconst (H|C|SV|LV|Header|Card|SaveIndicator|SI) = )/,
    FG_DEF + '$1'
  );
  
  if (beforeHelpers !== c) {
    fs.writeFileSync(fp, beforeHelpers, 'utf8');
    console.log(`FIXED: ${f} - added FG before helper component`);
    count++;
    continue;
  }
  
  // Try inserting after the main component's closing brace
  const afterMainComponent = c.replace(
    /(\nexport default function \w+[\s\S]*?\n}\n)(\nconst |\nfunction )/,
    '$1' + FG_DEF + '$2'
  );
  
  if (afterMainComponent !== c) {
    fs.writeFileSync(fp, afterMainComponent, 'utf8');
    console.log(`FIXED: ${f} - added FG after main component`);
    count++;
    continue;
  }
  
  // Last resort: add before the last const/function in the file
  const lastHelper = c.replace(
    /(\n(const|function) \w+[\s\S]*)$/,
    FG_DEF + '$1'
  );
  
  if (lastHelper !== c) {
    fs.writeFileSync(fp, lastHelper, 'utf8');
    console.log(`FIXED: ${f} - added FG before last helper`);
    count++;
    continue;
  }
  
  console.log(`FAILED: ${f} - could not find insertion point`);
}

console.log(`\nDone. Fixed ${count} files.`);
