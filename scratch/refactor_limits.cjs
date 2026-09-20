const fs = require('fs');
const path = require('path');

const directory = 'src';
const pattern1 = /limits\.([a-zA-Z0-9_]+)/g;
const pattern2 = /PLAN_LIMITS\[([^\]]+)\]\?\.([a-zA-Z0-9_]+)/g;

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(directory);

for (const file of files) {
    if (file.includes('planConfig.js')) continue;

    const originalContent = fs.readFileSync(file, 'utf8');
    let newContent = originalContent;

    newContent = newContent.replace(pattern1, "getLimit(limits, '$1')");
    newContent = newContent.replace(pattern2, "getLimit(PLAN_LIMITS[$1], '$2')");

    if (newContent !== originalContent) {
        if (!newContent.includes('getLimit(')) continue; 
        
        if (!newContent.includes('import {') || (!newContent.includes('getLimit') && !newContent.includes('from \'../lib/utils\'') && !newContent.includes('from \'../../lib/utils\''))) {
            // Need manual import handling if simple replace doesn't work
            if (newContent.includes('import { getTeamIds, PLAN_LIMITS')) {
                newContent = newContent.replace('PLAN_LIMITS', 'PLAN_LIMITS, getLimit');
            } else if (newContent.includes('import { PLAN_LIMITS')) {
                newContent = newContent.replace('import { PLAN_LIMITS', 'import { PLAN_LIMITS, getLimit');
            }
        } else if (newContent.includes('PLAN_LIMITS') && !newContent.includes('getLimit')) {
            newContent = newContent.replace('PLAN_LIMITS', 'PLAN_LIMITS, getLimit');
        }

        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated ${file}`);
    }
}
