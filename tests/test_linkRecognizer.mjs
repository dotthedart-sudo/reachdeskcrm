import { extractLinks } from '../src/lib/linkRecognizer.js';

console.log('--- TEST 1: dropbox.com ---');
console.log(extractLinks('dropbox.com')); // Should NOT be 'twitter', should be 'website'.

console.log('--- TEST 2: "Met at conf." ---');
console.log(extractLinks('Met at conf.')); // Should be empty

console.log('--- TEST 3: "2026-09-29" ---');
console.log(extractLinks('2026-09-29')); // Should be empty

console.log('--- TEST 4: "+1 555 019 2834" ---');
// Phone detection only when extractLinks(val, { isPhoneField: true }) OR wait, we should only extract phones if explicitly told, or if it is a phone-type column.
console.log(extractLinks('+1 555 019 2834', { isPhoneField: true })); 

console.log('--- TEST 5: Duplicates ---');
console.log(extractLinks(['https://linkedin.com/in/test', 'linkedin.com/in/test/']));
