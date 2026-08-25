const fs = require('fs');
const file = 'c:/Users/asiro/Desktop/Capstone/RORMS/frontend/src/components/DepartmentEditScheduleModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/isSelected \? 'bg-red-100 hover:bg-red-200' : 'hover:bg-gray-50'/g, "isSelected ? (isPlotMode ? 'bg-emerald-100 hover:bg-emerald-200' : 'bg-red-100 hover:bg-red-200') : 'hover:bg-gray-50'");
content = content.replace(/isSelected \? 'bg-red-100'/g, "isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100')");
content = content.replace(/isRemoveMode \? 'cursor-pointer/g, "(isRemoveMode || isPlotMode) ? 'cursor-pointer");
content = content.replace(/if \(isRemoveMode\) \{/g, "if (isRemoveMode || isPlotMode) {");
content = content.replace(/if \(!isEditable \|\| isRemoveMode \|\| !tbodyRef\.current\) return/g, "if (!isEditable || isRemoveMode || isPlotMode || !tbodyRef.current) return");

fs.writeFileSync(file, content);
