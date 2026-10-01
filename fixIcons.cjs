const fs = require('fs');

const files = [
  'src/components/Homepage.jsx',
  'src/components/GetStarted.jsx',
  'src/components/LegalPages.jsx',
  'src/components/BlogPost.jsx',
  'src/components/BlogIndex.jsx'
];

files.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');

  // Remove Youtube, Instagram, Linkedin from lucide-react imports
  code = code.replace(/,\s*Youtube,\s*Instagram,\s*Linkedin/g, '');
  code = code.replace(/Youtube,\s*Instagram,\s*Linkedin,\s*/g, '');

  // Add import for SiYoutube, SiInstagram, SiLinkedin from @icons-pack/react-simple-icons
  if (!code.includes('@icons-pack/react-simple-icons')) {
    code = "import { SiYoutube, SiInstagram } from '@icons-pack/react-simple-icons';\n" + code;
  }
  
  // Add inline SiLinkedin if needed
  if (!code.includes('SiLinkedin')) {
    const inlineLinkedin = `
const SiLinkedin = ({ size = 24, color = 'currentColor', ...props }) => (
  <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);
`;
    // Insert after the first few imports
    code = code.replace(/(import [^;]+;[\s\n]*)+/, match => match + inlineLinkedin);
  }

  // Replace <Youtube ... /> with <SiYoutube ... />
  code = code.replace(/<Youtube /g, '<SiYoutube ');
  code = code.replace(/<Instagram /g, '<SiInstagram ');
  code = code.replace(/<Linkedin /g, '<SiLinkedin ');

  fs.writeFileSync(file, code);
});
