import os
import re

directories = ['src']
pattern1 = re.compile(r'limits\.([a-zA-Z0-9_]+)')
pattern2 = re.compile(r'PLAN_LIMITS\[([^\]]+)\]\?\.([a-zA-Z0-9_]+)')

for root, dirs, files in os.walk(directories[0]):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js') or file.endswith('.ts') or file.endswith('.tsx'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Skip planConfig.js itself
            if 'planConfig.js' in filepath:
                continue
                
            new_content = content
            
            # limits.foo -> getLimit(limits, 'foo')
            new_content = pattern1.sub(r"getLimit(limits, '\1')", new_content)
            
            # PLAN_LIMITS[x]?.foo -> getLimit(PLAN_LIMITS[\1], '\2')
            new_content = pattern2.sub(r"getLimit(PLAN_LIMITS[\1], '\2')", new_content)
            
            if content != new_content:
                # auto import getLimit if missing
                if 'getLimit' not in new_content and filepath.endswith('.jsx'):
                    # it might already be imported, wait, let's just use regex to add to existing import
                    # finding import { ... } from '../lib/utils' or similar
                    if 'import { getTeamIds, PLAN_LIMITS' in new_content:
                        new_content = new_content.replace('PLAN_LIMITS', 'PLAN_LIMITS, getLimit')
                    elif 'import { PLAN_LIMITS' in new_content:
                        new_content = new_content.replace('import { PLAN_LIMITS', 'import { PLAN_LIMITS, getLimit')
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
