// Show overdue unfinished items in today's view without changing stored dates.
// Both the legacy task array and ChatGPT subcollection use this read-only filter.
function isOverdueUnfinished(task, today) {
  return task && task.done !== true &&
    typeof task.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(task.date) &&
    task.date < today;
}

function tasksForDate(items, viewDate, today) {
  return items.filter((task) =>
    task.date === viewDate ||
    (viewDate === today && isOverdueUnfinished(task, today))
  );
}

function taskOriginDate(task, viewDate, today) {
  if (viewDate === today && isOverdueUnfinished(task, today)) {
    return task.rolledFrom || task.date;
  }
  return task.rolledFrom || null;
}

export { tasksForDate, taskOriginDate };
