const fs = require('fs');
let code = fs.readFileSync('c:/Users/T15/reachdesk/src/components/ui/CompactSearch.jsx', 'utf8');

if (!code.includes('const [isMobileSearchOpen')) {
  code = code.replace(
    /const \[isOpen, setIsOpen\] = useState\(false\);/,
    'const [isOpen, setIsOpen] = useState(false);\n  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);'
  );
  
  if (!code.includes('import { Search, X } from')) {
    code = code.replace(
      /import \{ Search \} from "lucide-react";/,
      'import { Search, X } from "lucide-react";'
    );
  }
  fs.writeFileSync('c:/Users/T15/reachdesk/src/components/ui/CompactSearch.jsx', code);
  console.log('Fixed CompactSearch hooks');
} else {
  console.log('Hooks already exist');
}
