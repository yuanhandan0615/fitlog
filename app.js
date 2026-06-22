// FitLog - 个人力量训练记录工具
// 纯前端实现，数据存储在 localStorage

// ==================== 数据存储 ====================
const Storage = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(`fitlog_${key}`)) || [];
        } catch {
            return [];
        }
    },
    set(key, value) {
        localStorage.setItem(`fitlog_${key}`, JSON.stringify(value));
    },
    getSettings() {
        try {
            return JSON.parse(localStorage.getItem('fitlog_settings')) || { restTimer: 90 };
        } catch {
            return { restTimer: 90 };
        }
    },
    setSettings(settings) {
        localStorage.setItem('fitlog_settings', JSON.stringify(settings));
    }
};

// ==================== 工具函数 ====================
const Utils = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    formatDate(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    formatDateTime(date) {
        const d = new Date(date);
        return `${this.formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    },
    isSameWeek(date1, date2) {
        const w1 = this.getWeekStart(date1);
        const w2 = this.getWeekStart(date2);
        return w1.getTime() === w2.getTime();
    }
};

// ==================== 应用状态 ====================
const AppState = {
    currentPage: 'dashboard',
    activeWorkout: null,
    workoutTimer: null,
    workoutStartTime: null,
    restTimerInterval: null,
    editingPlan: null,
    chartInstance: null,
    chartType: 'weight'
};

// ==================== DOM 操作 ====================
function $(selector) { return document.querySelector(selector); }
function $$(selector) { return document.querySelectorAll(selector); }

function showPage(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#${pageId}-page`)?.classList.add('active');
    $$('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === pageId));
    AppState.currentPage = pageId;

    if (pageId === 'dashboard') renderDashboard();
    if (pageId === 'plans') renderPlans();
    if (pageId === 'history') renderHistory();
    if (pageId === 'analytics') renderAnalytics();
}

function showModal(modalId) {
    $(`#${modalId}`)?.classList.remove('hidden');
}

function hideModal(modalId) {
    $(`#${modalId}`)?.classList.add('hidden');
}

// ==================== 仪表盘 ====================
function renderDashboard() {
    const plans = Storage.get('plans');
    const records = Storage.get('records');
    const quickPlans = $('#quick-plans');

    if (plans.length === 0) {
        quickPlans.innerHTML = '<p class="empty-state">暂无训练计划，先去"计划"页面创建吧</p>';
    } else {
        quickPlans.innerHTML = plans.map(plan => `
            <div class="plan-card" data-plan-id="${plan.id}">
                <h3>${plan.name}</h3>
                <p>${plan.exercises.length} 个动作</p>
            </div>
        `).join('');

        quickPlans.querySelectorAll('.plan-card').forEach(card => {
            card.addEventListener('click', () => startWorkout(card.dataset.planId));
        });
    }

    // 本周统计
    const weekRecords = records.filter(r => Utils.isSameWeek(new Date(r.date), new Date()));
    $('#week-workouts').textContent = weekRecords.length;

    let weekVolume = 0, weekSets = 0, weekPRs = 0;
    weekRecords.forEach(r => {
        r.exerciseRecords?.forEach(er => {
            er.sets?.forEach(s => {
                if (s.completed) {
                    weekVolume += (s.weight || 0) * (s.reps || 0);
                    weekSets++;
                }
            });
        });
    });

    // 计算本周 PR
    const allPRs = findAllPRs(records);
    const weekPRList = allPRs.filter(pr => Utils.isSameWeek(new Date(pr.date), new Date()));
    weekPRs = weekPRList.length;

    $('#week-volume').textContent = weekVolume.toLocaleString();
    $('#week-sets').textContent = weekSets;
    $('#week-prs').textContent = weekPRs;

    // 最近 PR
    const recentPRs = $('#recent-prs-list');
    const latestPRs = allPRs.slice(-5).reverse();
    if (latestPRs.length === 0) {
        recentPRs.innerHTML = '<p class="empty-state">还没有记录，开始训练吧！</p>';
    } else {
        recentPRs.innerHTML = latestPRs.map(pr => `
            <div class="pr-item">
                <div>
                    <div class="pr-exercise">${pr.exerciseName}</div>
                    <div class="pr-date">${Utils.formatDate(pr.date)}</div>
                </div>
                <div class="pr-value">${pr.weight}kg × ${pr.reps}</div>
            </div>
        `).join('');
    }
}

// ==================== 计划管理 ====================
function renderPlans() {
    const plans = Storage.get('plans');
    const plansList = $('#plans-list');

    if (plans.length === 0) {
        plansList.innerHTML = '<p class="empty-state">还没有训练计划</p>';
        return;
    }

    plansList.innerHTML = plans.map(plan => `
        <div class="plan-item" data-plan-id="${plan.id}">
            <div class="plan-item-header">
                <h3>${plan.name}</h3>
                <div class="plan-item-actions">
                    <button class="btn btn-sm btn-secondary btn-edit-plan">编辑</button>
                    <button class="btn btn-sm btn-danger btn-delete-plan">删除</button>
                </div>
            </div>
            <div class="plan-exercises-list">
                ${plan.exercises.map(e => `${e.name} (${e.targetSets}组${e.targetReps ? '×' + e.targetReps + '次' : ''})`).join('、')}
            </div>
        </div>
    `).join('');

    plansList.querySelectorAll('.btn-edit-plan').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const planId = btn.closest('.plan-item').dataset.planId;
            editPlan(planId);
        });
    });

    plansList.querySelectorAll('.btn-delete-plan').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const planId = btn.closest('.plan-item').dataset.planId;
            if (confirm('确定要删除这个计划吗？')) {
                const plans = Storage.get('plans').filter(p => p.id !== planId);
                Storage.set('plans', plans);
                renderPlans();
            }
        });
    });
}

function openPlanModal(plan = null) {
    AppState.editingPlan = plan;
    $('#plan-modal-title').textContent = plan ? '编辑计划' : '新建计划';
    $('#plan-name').value = plan?.name || '';

    const container = $('#plan-exercises');
    if (plan && plan.exercises.length > 0) {
        container.innerHTML = plan.exercises.map((e, i) => createExerciseEditRow(e, i)).join('');
    } else {
        container.innerHTML = createExerciseEditRow({ name: '', targetSets: 3, targetReps: 8 }, 0);
    }

    showModal('plan-modal');
}

function createExerciseEditRow(exercise, index) {
    return `
        <div class="exercise-edit-row" data-index="${index}">
            <input type="text" class="form-input ex-name" placeholder="动作名称" value="${exercise.name}">
            <input type="number" class="form-input ex-sets" placeholder="组数" value="${exercise.targetSets}" min="1" max="20">
            <input type="number" class="form-input ex-reps" placeholder="次数" value="${exercise.targetReps || ''}" min="1" max="100">
            <button class="btn-remove" onclick="this.closest('.exercise-edit-row').remove()">&times;</button>
        </div>
    `;
}

function savePlan() {
    const name = $('#plan-name').value.trim();
    if (!name) {
        alert('请输入计划名称');
        return;
    }

    const exercises = [];
    $('#plan-exercises').querySelectorAll('.exercise-edit-row').forEach(row => {
        const name = row.querySelector('.ex-name').value.trim();
        const sets = parseInt(row.querySelector('.ex-sets').value) || 3;
        const reps = parseInt(row.querySelector('.ex-reps').value) || 0;
        if (name) {
            exercises.push({
                id: Utils.generateId(),
                name,
                targetSets: sets,
                targetReps: reps
            });
        }
    });

    if (exercises.length === 0) {
        alert('请至少添加一个动作');
        return;
    }

    const plans = Storage.get('plans');
    if (AppState.editingPlan) {
        const idx = plans.findIndex(p => p.id === AppState.editingPlan.id);
        if (idx >= 0) {
            plans[idx] = { ...AppState.editingPlan, name, exercises };
        }
    } else {
        plans.push({ id: Utils.generateId(), name, exercises });
    }

    Storage.set('plans', plans);
    hideModal('plan-modal');
    renderPlans();
}

function editPlan(planId) {
    const plan = Storage.get('plans').find(p => p.id === planId);
    if (plan) openPlanModal(plan);
}

// ==================== 训练记录 ====================
function startWorkout(planId) {
    const plan = Storage.get('plans').find(p => p.id === planId);
    if (!plan) return;

    const records = Storage.get('records');
    const lastWorkout = records
        .filter(r => r.planId === planId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    AppState.activeWorkout = {
        planId: plan.id,
        planName: plan.name,
        exerciseRecords: plan.exercises.map(ex => {
            const lastEx = lastWorkout?.exerciseRecords?.find(er => er.exerciseId === ex.id);
            return {
                exerciseId: ex.id,
                exerciseName: ex.name,
                targetSets: ex.targetSets,
                sets: Array(ex.targetSets).fill(null).map((_, i) => {
                    const lastSet = lastEx?.sets?.[i];
                    return {
                        weight: lastSet?.weight || '',
                        reps: lastSet?.reps || '',
                        completed: false
                    };
                })
            };
        })
    };

    AppState.workoutStartTime = Date.now();
    renderWorkout();
    showPage('workout');
    startWorkoutTimer();
}

function renderWorkout() {
    const workout = AppState.activeWorkout;
    if (!workout) return;

    $('#workout-plan-name').textContent = workout.planName;
    const container = $('#workout-exercises');

    container.innerHTML = workout.exerciseRecords.map((er, ei) => `
        <div class="exercise-block" data-exercise-index="${ei}">
            <div class="exercise-header">
                <div class="exercise-name">${er.exerciseName}</div>
                <div class="last-session">目标: ${er.targetSets}组</div>
            </div>
            <div class="sets-container">
                ${er.sets.map((set, si) => `
                    <div class="set-row" data-set-index="${si}">
                        <div class="set-number">${si + 1}</div>
                        <input type="number" class="set-input set-weight" placeholder="重量(kg)" value="${set.weight}" step="0.5">
                        <input type="number" class="set-input set-reps" placeholder="次数" value="${set.reps}">
                        <button class="set-complete ${set.completed ? 'completed' : ''}" data-exercise="${ei}" data-set="${si}">
                            ${set.completed ? '✓' : ''}
                        </button>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary btn-sm add-set-btn" data-exercise="${ei}">+ 添加组</button>
        </div>
    `).join('');

    // 绑定事件
    container.querySelectorAll('.set-complete').forEach(btn => {
        btn.addEventListener('click', () => toggleSetComplete(parseInt(btn.dataset.exercise), parseInt(btn.dataset.set)));
    });

    container.querySelectorAll('.add-set-btn').forEach(btn => {
        btn.addEventListener('click', () => addSet(parseInt(btn.dataset.exercise)));
    });

    // 自动保存输入
    container.querySelectorAll('.set-input').forEach(input => {
        input.addEventListener('change', saveWorkoutInputs);
    });
}

function saveWorkoutInputs() {
    const workout = AppState.activeWorkout;
    $('#workout-exercises').querySelectorAll('.exercise-block').forEach((block, ei) => {
        block.querySelectorAll('.set-row').forEach((row, si) => {
            if (workout.exerciseRecords[ei].sets[si]) {
                workout.exerciseRecords[ei].sets[si].weight = row.querySelector('.set-weight').value;
                workout.exerciseRecords[ei].sets[si].reps = row.querySelector('.set-reps').value;
            }
        });
    });
}

function toggleSetComplete(exerciseIndex, setIndex) {
    saveWorkoutInputs();
    const workout = AppState.activeWorkout;
    const set = workout.exerciseRecords[exerciseIndex].sets[setIndex];
    set.completed = !set.completed;

    renderWorkout();

    if (set.completed) {
        const settings = Storage.getSettings();
        showRestTimer(settings.restTimer || 90);
    }
}

function addSet(exerciseIndex) {
    saveWorkoutInputs();
    const workout = AppState.activeWorkout;
    const lastSet = workout.exerciseRecords[exerciseIndex].sets.slice(-1)[0];
    workout.exerciseRecords[exerciseIndex].sets.push({
        weight: lastSet?.weight || '',
        reps: lastSet?.reps || '',
        completed: false
    });
    renderWorkout();
}

function startWorkoutTimer() {
    if (AppState.workoutTimer) clearInterval(AppState.workoutTimer);
    AppState.workoutTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - AppState.workoutStartTime) / 1000);
        $('#workout-timer').textContent = Utils.formatDuration(elapsed);
    }, 1000);
}

function stopWorkoutTimer() {
    if (AppState.workoutTimer) {
        clearInterval(AppState.workoutTimer);
        AppState.workoutTimer = null;
    }
}

// ==================== 休息计时器 ====================
function showRestTimer(seconds) {
    let remaining = seconds;
    $('#rest-timer-display').textContent = Utils.formatDuration(remaining);
    showModal('rest-timer-modal');

    if (AppState.restTimerInterval) clearInterval(AppState.restTimerInterval);
    AppState.restTimerInterval = setInterval(() => {
        remaining--;
        $('#rest-timer-display').textContent = Utils.formatDuration(remaining);
        if (remaining <= 0) {
            clearInterval(AppState.restTimerInterval);
            $('#rest-timer-display').textContent = '00:00';
            // 可以在这里添加提示音
        }
    }, 1000);
}

function closeRestTimer() {
    if (AppState.restTimerInterval) {
        clearInterval(AppState.restTimerInterval);
        AppState.restTimerInterval = null;
    }
    hideModal('rest-timer-modal');
}

// ==================== 完成训练 ====================
function finishWorkout() {
    saveWorkoutInputs();
    const workout = AppState.activeWorkout;
    if (!workout) return;

    const duration = Math.floor((Date.now() - AppState.workoutStartTime) / 60000);

    const record = {
        id: Utils.generateId(),
        date: new Date().toISOString(),
        planId: workout.planId,
        planName: workout.planName,
        exerciseRecords: workout.exerciseRecords.map(er => ({
            exerciseId: er.exerciseId,
            exerciseName: er.exerciseName,
            sets: er.sets.filter(s => s.weight && s.reps).map(s => ({
                weight: parseFloat(s.weight) || 0,
                reps: parseInt(s.reps) || 0,
                completed: s.completed
            }))
        })).filter(er => er.sets.length > 0),
        duration
    };

    if (record.exerciseRecords.length === 0) {
        alert('请至少完成一个动作的记录');
        return;
    }

    const records = Storage.get('records');
    records.push(record);
    Storage.set('records', records);

    stopWorkoutTimer();
    AppState.activeWorkout = null;
    AppState.workoutStartTime = null;

    alert(`训练完成！用时 ${duration} 分钟`);
    showPage('dashboard');
}

function cancelWorkout() {
    if (confirm('确定要取消这次训练吗？数据将不会保存。')) {
        stopWorkoutTimer();
        AppState.activeWorkout = null;
        AppState.workoutStartTime = null;
        showPage('dashboard');
    }
}

// ==================== 历史记录 ====================
function renderHistory() {
    const records = Storage.get('records').sort((a, b) => new Date(b.date) - new Date(a.date));
    const historyList = $('#history-list');

    if (records.length === 0) {
        historyList.innerHTML = '<p class="empty-state">还没有训练记录</p>';
        return;
    }

    historyList.innerHTML = records.map(record => {
        const totalSets = record.exerciseRecords?.reduce((sum, er) => sum + (er.sets?.length || 0), 0) || 0;
        const totalVolume = record.exerciseRecords?.reduce((sum, er) =>
            sum + (er.sets?.reduce((s, set) => s + (set.weight * set.reps || 0), 0) || 0), 0) || 0;

        return `
            <div class="history-item" data-record-id="${record.id}">
                <div class="history-item-header">
                    <h3>${record.planName}</h3>
                    <div class="history-date">${Utils.formatDateTime(record.date)}</div>
                </div>
                <div class="history-summary">
                    ${record.exerciseRecords?.length || 0} 个动作 · ${totalSets} 组 · 容量 ${totalVolume.toLocaleString()}kg · ${record.duration || '?'} 分钟
                </div>
            </div>
        `;
    }).join('');

    historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => showWorkoutDetail(item.dataset.recordId));
    });
}

function showWorkoutDetail(recordId) {
    const record = Storage.get('records').find(r => r.id === recordId);
    if (!record) return;

    $('#detail-modal-title').textContent = `${record.planName} - ${Utils.formatDate(record.date)}`;

    const prs = findAllPRs(Storage.get('records'));
    const recordPRs = prs.filter(pr => Utils.formatDate(pr.date) === Utils.formatDate(record.date));

    $('#workout-detail-content').innerHTML = record.exerciseRecords?.map(er => {
        const hasPR = recordPRs.some(pr => pr.exerciseName === er.exerciseName);
        return `
            <div class="detail-exercise">
                <h4>${er.exerciseName} ${hasPR ? '<span class="pr-badge">PR</span>' : ''}</h4>
                <div class="detail-sets">
                    ${er.sets?.map((set, i) => {
                        const isPR = recordPRs.some(pr => pr.exerciseName === er.exerciseName && pr.setIndex === i);
                        return `
                            <div class="detail-set ${isPR ? 'pr' : ''}">
                                <span>第 ${i + 1} 组</span>
                                <span><strong>${set.weight}kg</strong> × ${set.reps}次</span>
                            </div>
                        `;
                    }).join('') || '<div class="detail-set">无记录</div>'}
                </div>
            </div>
        `;
    }).join('') || '<p class="empty-state">无动作记录</p>';

    showModal('workout-detail-modal');
}

// ==================== PR 检测 ====================
function findAllPRs(records) {
    const prs = [];
    const exerciseMaxWeight = {};
    const exerciseMaxVolume = {};

    records.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(record => {
        record.exerciseRecords?.forEach(er => {
            er.sets?.forEach((set, i) => {
                if (!set.weight || !set.reps) return;

                const key = er.exerciseName;
                const volume = set.weight * set.reps;

                // 重量 PR
                if (!exerciseMaxWeight[key] || set.weight > exerciseMaxWeight[key]) {
                    exerciseMaxWeight[key] = set.weight;
                    prs.push({
                        exerciseName: key,
                        weight: set.weight,
                        reps: set.reps,
                        date: record.date,
                        setIndex: i,
                        type: 'weight'
                    });
                }

                // 容量 PR (同重量下)
                if (!exerciseMaxVolume[key] || volume > exerciseMaxVolume[key]) {
                    exerciseMaxVolume[key] = volume;
                    // 避免重复记录
                    const existing = prs.find(p =>
                        p.exerciseName === key &&
                        Utils.formatDate(p.date) === Utils.formatDate(record.date) &&
                        p.setIndex === i
                    );
                    if (!existing) {
                        prs.push({
                            exerciseName: key,
                            weight: set.weight,
                            reps: set.reps,
                            date: record.date,
                            setIndex: i,
                            type: 'volume'
                        });
                    }
                }
            });
        });
    });

    return prs;
}

// ==================== 分析图表 ====================
function renderAnalytics() {
    const records = Storage.get('records');
    const select = $('#analytics-exercise');

    // 获取所有动作
    const exercises = new Set();
    records.forEach(r => r.exerciseRecords?.forEach(er => exercises.add(er.exerciseName)));
    const exerciseList = Array.from(exercises).sort();

    const currentValue = select.value;
    select.innerHTML = '<option value="">选择动作</option>' + exerciseList.map(e =>
        `<option value="${e}" ${e === currentValue ? 'selected' : ''}>${e}</option>`
    ).join('');

    if (currentValue) {
        updateChart(currentValue);
    } else {
        if (AppState.chartInstance) {
            AppState.chartInstance.destroy();
            AppState.chartInstance = null;
        }
        $('#exercise-stats').innerHTML = '';
    }
}

function updateChart(exerciseName) {
    const records = Storage.get('records').sort((a, b) => new Date(a.date) - new Date(b.date));
    const data = [];

    records.forEach(record => {
        const er = record.exerciseRecords?.find(e => e.exerciseName === exerciseName);
        if (!er) return;

        const date = Utils.formatDate(record.date);

        if (AppState.chartType === 'weight') {
            // 取每组的最大重量
            er.sets?.forEach(set => {
                if (set.weight) {
                    data.push({ date, value: set.weight });
                }
            });
        } else {
            // 容量 = 所有组的总和
            const volume = er.sets?.reduce((sum, set) => sum + (set.weight * set.reps || 0), 0) || 0;
            if (volume > 0) {
                data.push({ date, value: volume });
            }
        }
    });

    if (data.length === 0) {
        if (AppState.chartInstance) {
            AppState.chartInstance.destroy();
            AppState.chartInstance = null;
        }
        $('#exercise-stats').innerHTML = '<p class="empty-state">该动作暂无数据</p>';
        return;
    }

    const ctx = $('#progress-chart').getContext('2d');

    if (AppState.chartInstance) {
        AppState.chartInstance.destroy();
    }

    AppState.chartInstance = new Chart(ctx, {
        type: AppState.chartType === 'weight' ? 'line' : 'bar',
        data: {
            labels: data.map(d => d.date),
            datasets: [{
                label: AppState.chartType === 'weight' ? '重量 (kg)' : '容量 (kg)',
                data: data.map(d => d.value),
                borderColor: '#2563eb',
                backgroundColor: AppState.chartType === 'weight' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(37, 99, 235, 0.6)',
                borderWidth: 2,
                fill: AppState.chartType === 'weight',
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: '#e2e8f0' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    // 统计信息
    const values = data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    const first = values[0];
    const last = values[values.length - 1];
    const change = ((last - first) / first * 100).toFixed(1);

    $('#exercise-stats').innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${max}</div>
            <div class="stat-label">最高${AppState.chartType === 'weight' ? '重量' : '容量'}</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avg}</div>
            <div class="stat-label">平均${AppState.chartType === 'weight' ? '重量' : '容量'}</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.length}</div>
            <div class="stat-label">训练次数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: ${change >= 0 ? 'var(--success)' : 'var(--danger)'}">${change > 0 ? '+' : ''}${change}%</div>
            <div class="stat-label">总变化</div>
        </div>
    `;
}

// ==================== 数据导入导出 ====================
function exportData() {
    const data = {
        plans: Storage.get('plans'),
        records: Storage.get('records'),
        settings: Storage.getSettings(),
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitlog_backup_${Utils.formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.plans) Storage.set('plans', data.plans);
            if (data.records) Storage.set('records', data.records);
            if (data.settings) Storage.setSettings(data.settings);
            alert('数据导入成功！');
            showPage('dashboard');
        } catch (err) {
            alert('导入失败：文件格式错误');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
        localStorage.removeItem('fitlog_plans');
        localStorage.removeItem('fitlog_records');
        localStorage.removeItem('fitlog_settings');
        alert('数据已清空');
        showPage('dashboard');
    }
}

// ==================== 事件绑定 ====================
function initEventListeners() {
    // 导航
    $$('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => showPage(tab.dataset.page));
    });

    // 新建计划
    $('#btn-new-plan')?.addEventListener('click', () => openPlanModal());

    // 保存计划
    $('#btn-save-plan')?.addEventListener('click', savePlan);
    $('#btn-cancel-plan')?.addEventListener('click', () => hideModal('plan-modal'));

    // 添加动作
    $('#btn-add-exercise')?.addEventListener('click', () => {
        const container = $('#plan-exercises');
        const index = container.querySelectorAll('.exercise-edit-row').length;
        const div = document.createElement('div');
        div.innerHTML = createExerciseEditRow({ name: '', targetSets: 3, targetReps: 8 }, index);
        container.appendChild(div.firstElementChild);
    });

    // 关闭弹窗
    $$('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.add('hidden');
        });
    });

    // 训练控制
    $('#btn-finish-workout')?.addEventListener('click', finishWorkout);
    $('#btn-cancel-workout')?.addEventListener('click', cancelWorkout);

    // 休息计时器
    $('#btn-timer-done')?.addEventListener('click', closeRestTimer);
    $('#btn-timer-add-30')?.addEventListener('click', () => {
        // 重新显示计时器，增加30秒
        const display = $('#rest-timer-display').textContent;
        const [m, s] = display.split(':').map(Number);
        const remaining = m * 60 + s + 30;
        closeRestTimer();
        showRestTimer(remaining);
    });

    // 设置
    $('#btn-export')?.addEventListener('click', exportData);
    $('#btn-import')?.addEventListener('click', () => $('#import-file')?.click());
    $('#import-file')?.addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
    });
    $('#btn-clear')?.addEventListener('click', clearAllData);

    $('#rest-timer-default')?.addEventListener('change', (e) => {
        const settings = Storage.getSettings();
        settings.restTimer = parseInt(e.target.value) || 90;
        Storage.setSettings(settings);
    });

    // 分析页
    $('#analytics-exercise')?.addEventListener('change', (e) => {
        if (e.target.value) updateChart(e.target.value);
    });

    $$('.chart-type-toggle .btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.chart-type-toggle .btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AppState.chartType = btn.dataset.chart;
            const exercise = $('#analytics-exercise').value;
            if (exercise) updateChart(exercise);
        });
    });

    // 点击弹窗外部关闭
    $$('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });
}

// ==================== 初始化 ====================
function init() {
    // 加载设置
    const settings = Storage.getSettings();
    $('#rest-timer-default').value = settings.restTimer || 90;

    initEventListeners();
    showPage('dashboard');

    // 添加示例数据（首次使用）
    const plans = Storage.get('plans');
    if (plans.length === 0) {
        // 可以预置一个示例计划
        Storage.set('plans', [{
            id: Utils.generateId(),
            name: '推日（示例）',
            exercises: [
                { id: Utils.generateId(), name: '杠铃卧推', targetSets: 4, targetReps: 8 },
                { id: Utils.generateId(), name: '哑铃上斜卧推', targetSets: 3, targetReps: 10 },
                { id: Utils.generateId(), name: '绳索下压', targetSets: 3, targetReps: 12 },
                { id: Utils.generateId(), name: '侧平举', targetSets: 4, targetReps: 15 }
            ]
        }, {
            id: Utils.generateId(),
            name: '拉日（示例）',
            exercises: [
                { id: Utils.generateId(), name: '引体向上', targetSets: 4, targetReps: 8 },
                { id: Utils.generateId(), name: '杠铃划船', targetSets: 4, targetReps: 10 },
                { id: Utils.generateId(), name: '面拉', targetSets: 3, targetReps: 15 },
                { id: Utils.generateId(), name: '二头弯举', targetSets: 3, targetReps: 12 }
            ]
        }]);
        renderDashboard();
    }
}

// 启动
document.addEventListener('DOMContentLoaded', init);
