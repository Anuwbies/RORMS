const fs = require('fs');
const file = 'c:/Users/asiro/Desktop/Capstone/RORMS/frontend/src/components/DepartmentEditScheduleModal.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "const isSelected = selectedScheduleIds.includes(schedule.id) || (!!schedule.parentId && selectedScheduleIds.includes(schedule.parentId));",
  "const isSelected = selectedScheduleIds.includes(schedule.id) || (!!schedule.parentId && selectedScheduleIds.includes(schedule.parentId));\n                    const isPlottable = !schedule.status || schedule.status === 'Drafted';"
);

content = content.replace(
  "className={`${isSelected ? (isPlotMode ? 'bg-emerald-100 hover:bg-emerald-200' : 'bg-red-100 hover:bg-red-200') : 'hover:bg-gray-50'} ${(isRemoveMode || isPlotMode) ? 'cursor-pointer [&>td>*]:pointer-events-none' : ''} ${!isEditable ? '[&>td>*]:pointer-events-none opacity-95' : ''}`}",
  "className={`${isSelected ? (isPlotMode ? 'bg-emerald-100 hover:bg-emerald-200' : 'bg-red-100 hover:bg-red-200') : (isPlotMode && !isPlottable ? 'bg-gray-50/50 opacity-60' : 'hover:bg-gray-50')} ${(isRemoveMode || (isPlotMode && isPlottable)) ? 'cursor-pointer [&>td>*]:pointer-events-none' : ''} ${(isPlotMode && !isPlottable) ? 'cursor-not-allowed [&>td>*]:pointer-events-none' : ''} ${!isEditable ? '[&>td>*]:pointer-events-none opacity-95' : ''}`}"
);

content = content.replace(
  "if (isRemoveMode || isPlotMode) {\n                            e.preventDefault();\n                            e.stopPropagation();\n                            const targetId = schedule.parentId || schedule.id;",
  "if (isRemoveMode || isPlotMode) {\n                            e.preventDefault();\n                            e.stopPropagation();\n                            if (isPlotMode && !isPlottable) return;\n                            const targetId = schedule.parentId || schedule.id;"
);

fs.writeFileSync(file, content);
