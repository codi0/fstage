let _tasks = [
  {
    id: '1',
    title: 'Set up project structure',
    description: 'Create the base project layout and ensure all core modules load correctly.',
    completed: false,
    priority: 'high'
  },
  {
    id: '2',
    title: 'Review routing',
    description: 'Confirm routes, placeholders, and navigation lifecycle behaviour.',
    completed: false,
    priority: 'medium'
  },
  {
    id: '3',
    title: 'Build example views',
    description: 'Add realistic pages to the example app to create interaction pressure.',
    completed: false,
    priority: 'high'
  },
  {
    id: '4',
    title: 'Evaluate interaction layer',
    description: 'Assess whether interaction, gesture, and animation modules are justified.',
    completed: false,
    priority: 'low'
  },
  {
    id: '5',
    title: 'Document findings',
    description: 'Write down what feels webby vs native once the UI is in place.',
    completed: false,
    priority: 'medium'
  }
];

// expand to create scroll pressure
for (let i = 6; i <= 30; i++) {
  _tasks.push({
    id: String(i),
    title: `Example task ${i}`,
    description: `This is a placeholder description for task ${i}.`,
    completed: i % 3 === 0,
    priority: i % 2 === 0 ? 'low' : 'medium'
  });
}

/**
 * Return all tasks
 */
export function getTasks() {
  return _tasks;
}

/**
 * Get a single task by id
 */
export function getTaskById(id) {
  return _tasks.find(t => t.id === String(id));
}

/**
 * Toggle completion state
 */
export function toggleTask(id) {
  const task = getTaskById(id);
  if (task) {
    task.completed = !task.completed;
  }
  return task;
}

/**
 * Update a task (simple merge)
 */
export function updateTask(id, data = {}) {
  const task = getTaskById(id);
  if (task) {
    Object.assign(task, data);
  }
  return task;
}