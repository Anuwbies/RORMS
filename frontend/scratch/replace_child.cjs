const fs = require('fs');
const file = 'c:/Users/asiro/Desktop/Capstone/RORMS/frontend/src/components/DepartmentEditScheduleModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\(isChild \? 'bg-gray-50\/50/g, "((!isSelected && isChild) ? 'bg-gray-50/50");

fs.writeFileSync(file, content);
