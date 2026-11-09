// ----------------------------------------------------
// Pace Plot Custom 4-Week Athletic Training Plan Generator
// ----------------------------------------------------

const LOCAL_STORAGE_PLAN_KEY = 'paceplot_active_training_plan';

export const EVENT_GOALS = [
  { id: '5k', name: '5K Race', distance: 3.1, icon: 'fa-person-running', desc: 'Speed, aerobic power & fast finish' },
  { id: '10k', name: '10K Classic', distance: 6.2, icon: 'fa-medal', desc: 'Threshold endurance & cruise intervals' },
  { id: 'half', name: 'Half Marathon', distance: 13.1, icon: 'fa-award', desc: 'Progressive long runs & steady stamina' },
  { id: 'marathon', name: 'Marathon', distance: 26.2, icon: 'fa-crown', desc: 'Peak mileage volume & marathon pace tempo' },
  { id: 'base', name: 'Base Building', distance: 4.0, icon: 'fa-shield-heart', desc: 'Zone 2 aerobic foundation & zero injury risk' }
];

export function calculatePaces(basePaceSeconds) {
  const safePace = Math.max(300, Math.min(900, basePaceSeconds || 510)); // 5:00 to 15:00 min/mile safe window

  return {
    recoveryPace: safePace + 80,
    easyPace: safePace + 55,
    marathonPace: safePace + 30,
    tempoPace: safePace + 15,
    intervalPace: Math.max(260, safePace - 25),
    vdotPaceFormatted: formatPace(safePace),
    recoveryPaceFormatted: formatPace(safePace + 80),
    easyPaceFormatted: formatPace(safePace + 55),
    marathonPaceFormatted: formatPace(safePace + 30),
    tempoPaceFormatted: formatPace(safePace + 15),
    intervalPaceFormatted: formatPace(Math.max(260, safePace - 25))
  };
}

export function formatPace(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"/mi`;
}

export function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.round(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function generate4WeekPlan(goalId = '5k', basePaceSeconds = 510) {
  const paces = calculatePaces(basePaceSeconds);
  const goal = EVENT_GOALS.find(g => g.id === goalId) || EVENT_GOALS[0];

  let weeks = [];

  if (goalId === '5k') {
    const predictedFinishSeconds = 3.10686 * basePaceSeconds;
    weeks = [
      {
        weekNum: 1,
        title: 'Week 1: Aerobic Base & Rhythm',
        focus: 'Establish aerobic volume & neuromuscular cadence',
        targetMiles: 12.5,
        days: [
          { day: 'Mon', title: 'Easy Aerobic Run', dist: 3.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Relaxed greenway run with 4x20s light strides.', completed: true },
          { day: 'Wed', title: '5K Interval Speed Session', dist: 3.5, type: 'interval', pace: paces.intervalPaceFormatted, zone: 'Zone 4', desc: '1 mi warmup, 4x400m at interval pace with 90s jog recovery, 1 mi cooldown.', completed: true },
          { day: 'Fri', title: 'Recovery Maintenance', dist: 2.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1-2', desc: 'Conversational pace on 100% lit sidewalk path.', completed: false },
          { day: 'Sun', title: 'Aerobic Long Run', dist: 4.5, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Steady endurance run through parks.', completed: false }
        ]
      },
      {
        weekNum: 2,
        title: 'Week 2: Lactate Threshold Build',
        focus: 'Raise threshold tolerance to maintain 5K speed',
        targetMiles: 15.0,
        days: [
          { day: 'Mon', title: 'Base Stride Run', dist: 3.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Smooth pace with consistent 170 spm cadence.', completed: false },
          { day: 'Wed', title: 'Threshold Cruise Tempo', dist: 4.0, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 2 mi continuous tempo at threshold, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Active Recovery', dist: 2.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Gentle restorative jog or power walk.', completed: false },
          { day: 'Sun', title: 'Progressive Long Run', dist: 5.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Negative split: run the final mile 15s faster.', completed: false }
        ]
      },
      {
        weekNum: 3,
        title: 'Week 3: Peak Volume & Race Pace Simulation',
        focus: 'Peak training stimulus before pre-event taper',
        targetMiles: 17.0,
        days: [
          { day: 'Mon', title: 'Aerobic Maintenance', dist: 4.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Continuous easy run along trail greenway.', completed: false },
          { day: 'Wed', title: '5K Race Pace Simulation', dist: 4.5, type: 'interval', pace: paces.intervalPaceFormatted, zone: 'Zone 4-5', desc: '1 mi warmup, 3x1000m at target 5K race pace with 2m jog rest, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Easy Shakeout', dist: 3.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 2', desc: 'Relaxed form check and post-run stretch.', completed: false },
          { day: 'Sun', title: 'Over-Distance Peak Long Run', dist: 5.5, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Endurance bank for confident 5K speed.', completed: false }
        ]
      },
      {
        weekNum: 4,
        title: 'Week 4: Strategic Taper & Event Execution',
        focus: 'Full glycogen recharge & peak freshness for PR',
        targetMiles: 11.5,
        days: [
          { day: 'Mon', title: 'Taper Shakeout Run', dist: 3.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Short, snappy jog with 4 fast pick-ups.', completed: false },
          { day: 'Wed', title: 'Neuromuscular Tune-Up', dist: 2.5, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 3x300m at race pace, easy cooldown.', completed: false },
          { day: 'Fri', title: 'Pre-Race Activation', dist: 1.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Easy 15-minute jog + dynamic drills.', completed: false },
          { day: 'Sun', title: '5K Target Event / Time Trial', dist: 3.1, type: 'race', pace: formatPace(basePaceSeconds), zone: 'Zone 5', desc: 'Race day execution! Trust your training and attack the course.', completed: false }
        ]
      }
    ];

    return {
      goalId,
      goalName: '5K Race Target',
      targetDistance: 3.1,
      basePaceSeconds,
      paces,
      predictedTime: formatTime(predictedFinishSeconds),
      totalMiles: 56.0,
      weeks
    };
  }

  if (goalId === '10k') {
    const predictedFinishSeconds = 6.21371 * (basePaceSeconds * 1.05);
    weeks = [
      {
        weekNum: 1,
        title: 'Week 1: Base & Cruise Intervals',
        focus: 'Aerobic capacity & cruise interval efficiency',
        targetMiles: 17.5,
        days: [
          { day: 'Mon', title: 'Easy Base Run', dist: 4.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Conversational pace through park loop.', completed: false },
          { day: 'Wed', title: 'Cruise Intervals', dist: 4.5, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3-4', desc: '1 mi warmup, 4x800m threshold cruise with 60s rest, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Recovery Run', dist: 3.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Gentle recovery along lit sidewalks.', completed: false },
          { day: 'Sun', title: 'Steady Long Run', dist: 6.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Foundational aerobic endurance.', completed: false }
        ]
      },
      {
        weekNum: 2,
        title: 'Week 2: Threshold Extension',
        focus: 'Sustain threshold pace over longer intervals',
        targetMiles: 20.0,
        days: [
          { day: 'Mon', title: 'Aerobic Stride Run', dist: 4.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Steady cadence with 5x100m strides.', completed: false },
          { day: 'Wed', title: 'Lactate Threshold Tempo', dist: 5.0, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 3 mi continuous threshold tempo, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Easy Flush Run', dist: 3.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1-2', desc: 'Low heart rate recovery session.', completed: false },
          { day: 'Sun', title: 'Endurance Long Run', dist: 7.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Progressive finish over the final 2 miles.', completed: false }
        ]
      },
      {
        weekNum: 3,
        title: 'Week 3: Peak Volume Block',
        focus: 'Maximum aerobic load & 10K event pace mastery',
        targetMiles: 23.5,
        days: [
          { day: 'Mon', title: 'Easy Base Stride', dist: 5.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Solid midweek volume.', completed: false },
          { day: 'Wed', title: '10K Pace Repeats', dist: 5.5, type: 'interval', pace: paces.intervalPaceFormatted, zone: 'Zone 4', desc: '1.5 mi warmup, 5x1000m at 10K race pace, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Recovery Shakeout', dist: 4.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Smooth relaxed rhythm.', completed: false },
          { day: 'Sun', title: 'Peak Long Run (9.0 mi)', dist: 9.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Highest endurance benchmark of training block.', completed: false }
        ]
      },
      {
        weekNum: 4,
        title: 'Week 4: Taper & 10K Race Execution',
        focus: 'Supercompensation, rest & race day PR',
        targetMiles: 15.2,
        days: [
          { day: 'Mon', title: 'Taper Easy Run', dist: 3.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Shortened distance with fast cadence.', completed: false },
          { day: 'Wed', title: 'Sharpening Repeats', dist: 3.5, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 3x400m race pace, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Pre-Race Shakeout', dist: 2.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: '15 min activation with dynamic mobility.', completed: false },
          { day: 'Sun', title: '10K Championship / Goal Race', dist: 6.2, type: 'race', pace: formatPace(basePaceSeconds * 1.05), zone: 'Zone 4-5', desc: 'Race day! Execute even splits and finish strong.', completed: false }
        ]
      }
    ];

    return {
      goalId,
      goalName: '10K Classic Plan',
      targetDistance: 6.2,
      basePaceSeconds,
      paces,
      predictedTime: formatTime(predictedFinishSeconds),
      totalMiles: 76.2,
      weeks
    };
  }

  if (goalId === 'half') {
    const predictedFinishSeconds = 13.1094 * (basePaceSeconds * 1.08);
    weeks = [
      {
        weekNum: 1,
        title: 'Week 1: Half Marathon Foundation',
        focus: 'Volume building and steady tempo rhythm',
        targetMiles: 23.0,
        days: [
          { day: 'Mon', title: 'Aerobic Base', dist: 4.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Continuous steady run on greenway.', completed: false },
          { day: 'Wed', title: 'Progressive Tempo', dist: 5.5, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 3.5 mi tempo, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Recovery Run', dist: 4.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Light aerobic recovery.', completed: false },
          { day: 'Sun', title: 'Foundational Long Run', dist: 9.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Hydration and fueling practice run.', completed: false }
        ]
      },
      {
        weekNum: 2,
        title: 'Week 2: Stamina & Threshold Expansion',
        focus: 'Aerobic threshold and mid-run sustained speed',
        targetMiles: 27.0,
        days: [
          { day: 'Mon', title: 'Aerobic Stride Run', dist: 5.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Paved trail loop with 6 strides.', completed: false },
          { day: 'Wed', title: 'Half Marathon Pace Block', dist: 6.5, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 4.5 mi at half marathon pace, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Recovery Easy', dist: 4.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Zero impact stress, light stride.', completed: false },
          { day: 'Sun', title: 'Double Digit Long Run', dist: 11.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: '11 miles aerobic endurance benchmark.', completed: false }
        ]
      },
      {
        weekNum: 3,
        title: 'Week 3: Peak Mileage & 13.1 Simulation',
        focus: 'Peak volume stimulus and confidence',
        targetMiles: 30.5,
        days: [
          { day: 'Mon', title: 'Base Recovery', dist: 5.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Easy aerobic cadence.', completed: false },
          { day: 'Wed', title: 'Cruise Threshold Repeats', dist: 7.0, type: 'interval', pace: paces.tempoPaceFormatted, zone: 'Zone 3-4', desc: '1.5 mi warmup, 4x1 mi threshold with 90s rest, 1.5 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Shakeout Easy', dist: 4.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Flush legs before peak weekend long run.', completed: false },
          { day: 'Sun', title: 'Peak Long Run (14.0 mi)', dist: 14.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Over-distance stamina build.', completed: false }
        ]
      },
      {
        weekNum: 4,
        title: 'Week 4: Taper & Half Marathon Race Day',
        focus: 'Glycogen retention, fresh legs and personal best',
        targetMiles: 22.1,
        days: [
          { day: 'Mon', title: 'Taper Easy Run', dist: 4.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Low volume, high form focus.', completed: false },
          { day: 'Wed', title: 'Pace Sharpening', dist: 3.5, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi warmup, 1.5 mi target race pace, 1 mi cooldown.', completed: false },
          { day: 'Fri', title: 'Pre-Race Shakeout', dist: 1.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: '15 minute easy jog + 3 strides.', completed: false },
          { day: 'Sun', title: 'Half Marathon Race Day (13.1 mi)', dist: 13.1, type: 'race', pace: formatPace(basePaceSeconds * 1.08), zone: 'Zone 3-4', desc: 'Execute race pacing strategy and crush your half marathon goal!', completed: false }
        ]
      }
    ];

    return {
      goalId,
      goalName: 'Half Marathon Stride',
      targetDistance: 13.1,
      basePaceSeconds,
      paces,
      predictedTime: formatTime(predictedFinishSeconds),
      totalMiles: 102.6,
      weeks
    };
  }

  // Base building fallback
  const predictedFinishSeconds = 4.0 * basePaceSeconds;
  weeks = [
    {
      weekNum: 1,
      title: 'Week 1: Aerobic Habit Building',
      focus: 'Consistent comfortable mileage in Zone 2',
      targetMiles: 12.0,
      days: [
        { day: 'Mon', title: 'Conversational Stride', dist: 3.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Easy greenway loop at conversational effort.', completed: false },
        { day: 'Wed', title: 'Midweek Aerobic Run', dist: 3.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Consistent 170 spm cadence with zero strain.', completed: false },
        { day: 'Fri', title: 'Recovery Stride', dist: 2.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Light easy flush.', completed: false },
        { day: 'Sun', title: 'Weekend Long Loop', dist: 4.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Comfortable steady weekend run.', completed: false }
      ]
    },
    {
      weekNum: 2,
      title: 'Week 2: Gentle Volume Progression',
      focus: 'Safe 10% volume increase with high sidewalk safety',
      targetMiles: 14.5,
      days: [
        { day: 'Mon', title: 'Base Run', dist: 3.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Lit trail corridor.', completed: false },
        { day: 'Wed', title: 'Steady Cadence Run', dist: 3.5, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Add 4x30s light pickup strides.', completed: false },
        { day: 'Fri', title: 'Recovery Stride', dist: 2.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Gentle recovery.', completed: false },
        { day: 'Sun', title: 'Long Loop', dist: 5.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Build steady stamina.', completed: false }
      ]
    },
    {
      weekNum: 3,
      title: 'Week 3: Peak Base Aerobic Block',
      focus: 'Comfortable endurance ceiling expansion',
      targetMiles: 17.0,
      days: [
        { day: 'Mon', title: 'Aerobic Stride', dist: 4.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Greenway perimeter loop.', completed: false },
        { day: 'Wed', title: 'Gentle Tempo Introduction', dist: 4.0, type: 'tempo', pace: paces.tempoPaceFormatted, zone: 'Zone 3', desc: '1 mi easy, 2 mi controlled tempo, 1 mi easy.', completed: false },
        { day: 'Fri', title: 'Easy Recovery', dist: 3.0, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Smooth effortless strides.', completed: false },
        { day: 'Sun', title: 'Peak Long Run', dist: 6.0, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Solid 6-mile aerobic foundation benchmark.', completed: false }
      ]
    },
    {
      weekNum: 4,
      title: 'Week 4: Adaptation & Recovery Week',
      focus: 'Cellular recovery and adaptation to prepare for next block',
      targetMiles: 13.0,
      days: [
        { day: 'Mon', title: 'Easy Stride', dist: 3.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Light smooth loop.', completed: false },
        { day: 'Wed', title: 'Form & Cadence Drill', dist: 3.0, type: 'easy', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Focus on tall posture and soft foot strikes.', completed: false },
        { day: 'Fri', title: 'Gentle Recovery', dist: 2.5, type: 'easy', pace: paces.recoveryPaceFormatted, zone: 'Zone 1', desc: 'Low heart rate relaxation.', completed: false },
        { day: 'Sun', title: 'Benchmark Celebration Run', dist: 4.5, type: 'long', pace: paces.easyPaceFormatted, zone: 'Zone 2', desc: 'Celebrate your 4-week base completion with a confident run!', completed: false }
      ]
    }
  ];

  return {
    goalId,
    goalName: 'Aerobic Base Builder',
    targetDistance: 4.0,
    basePaceSeconds,
    paces,
    predictedTime: formatTime(predictedFinishSeconds),
    totalMiles: 56.5,
    weeks
  };
}

export function saveActivePlan(plan) {
  try {
    localStorage.setItem(LOCAL_STORAGE_PLAN_KEY, JSON.stringify(plan));
  } catch (_) {}
}

export function loadActivePlan() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PLAN_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

// ----------------------------------------------------
// Historical Max Heart Rate & 5-Zone Biometric Engine
// ----------------------------------------------------
export const MAX_HR_OVERRIDE_STORAGE_KEY = 'paceplot_custom_max_hr';

export const DEFAULT_HISTORICAL_WORKOUTS = [
  {
    id: 'hist-mon',
    day: 'Mon',
    routeTitle: 'Easy Greenway Loop',
    distance: 3.1,
    durationSeconds: 1620,
    avgPace: "8'42\"",
    avgHeartRate: 124,
    maxHeartRate: 142
  },
  {
    id: 'hist-tue',
    day: 'Tue',
    routeTitle: 'Aerobic Base Corridor',
    distance: 4.5,
    durationSeconds: 2340,
    avgPace: "8'40\"",
    avgHeartRate: 126,
    maxHeartRate: 145
  },
  {
    id: 'hist-thu',
    day: 'Thu',
    routeTitle: 'Watershed Tempo Progression',
    distance: 5.0,
    durationSeconds: 2520,
    avgPace: "8'24\"",
    avgHeartRate: 146,
    maxHeartRate: 171
  },
  {
    id: 'hist-fri',
    day: 'Fri',
    routeTitle: 'Lit Sidewalk Recovery Flush',
    distance: 3.1,
    durationSeconds: 1740,
    avgPace: "9'21\"",
    avgHeartRate: 109,
    maxHeartRate: 123
  },
  {
    id: 'hist-sat',
    day: 'Sat',
    routeTitle: '10K Threshold Benchmark',
    distance: 6.2,
    durationSeconds: 3060,
    avgPace: "8'13\"",
    avgHeartRate: 162,
    maxHeartRate: 188
  },
  {
    id: 'hist-sun',
    day: 'Sun',
    routeTitle: 'Sunday Park Perimeter Long Run',
    distance: 4.0,
    durationSeconds: 2040,
    avgPace: "8'30\"",
    avgHeartRate: 125,
    maxHeartRate: 144
  }
];

export function getStoredMaxHrOverride(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(MAX_HR_OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 130 && parsed <= 225) {
      return Math.round(parsed);
    }
  } catch (_) {}
  return null;
}

export function setStoredMaxHrOverride(maxHrValue, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return null;
  try {
    if (maxHrValue === null || maxHrValue === undefined || maxHrValue === '') {
      storage.removeItem(MAX_HR_OVERRIDE_STORAGE_KEY);
      return null;
    }
    const clamped = Math.max(130, Math.min(225, Math.round(Number(maxHrValue))));
    if (Number.isFinite(clamped)) {
      storage.setItem(MAX_HR_OVERRIDE_STORAGE_KEY, String(clamped));
      return clamped;
    }
  } catch (_) {}
  return null;
}

/**
 * Derives the user's historical maximum heart rate, average heart rate, and peak session
 * from their baseline training log combined with any synced Firestore/logged workouts.
 */
export function deriveHistoricalMaxHeartRate(extraWorkouts = [], overrideMaxHr = null, includeBaseline = true) {
  const validExtras = Array.isArray(extraWorkouts)
    ? extraWorkouts.filter(w => w && (Number(w.avgHeartRate) > 0 || Number(w.maxHeartRate) > 0))
    : [];

  const combined = includeBaseline
    ? [...DEFAULT_HISTORICAL_WORKOUTS, ...validExtras]
    : (validExtras.length > 0 ? validExtras : [...DEFAULT_HISTORICAL_WORKOUTS]);

  let detectedMaxHr = 188;
  let peakWorkoutTitle = '10K Threshold Benchmark';
  let totalWeightedHr = 0;
  let totalDurationSec = 0;
  let highestPeakSeen = 0;

  combined.forEach((w) => {
    const dur = Math.max(300, Number(w.durationSeconds) || 1500);
    const avgHr = Number(w.avgHeartRate) || 142;
    const explicitMax = Number(w.maxHeartRate) || 0;
    // Estimate peak HR from session avgHeartRate when explicit maxHeartRate is not stored in cloud schema
    const estimatedPeak = explicitMax > 0
      ? explicitMax
      : Math.round(avgHr * (avgHr >= 160 ? 1.15 : 1.21));

    if (estimatedPeak > highestPeakSeen) {
      highestPeakSeen = estimatedPeak;
      peakWorkoutTitle = w.routeTitle || 'Recorded Workout';
    }

    totalWeightedHr += avgHr * dur;
    totalDurationSec += dur;
  });

  if (highestPeakSeen > 0) {
    detectedMaxHr = Math.max(140, Math.min(220, Math.round(highestPeakSeen)));
  }

  const historicalAvgHr = totalDurationSec > 0
    ? Math.round(totalWeightedHr / totalDurationSec)
    : 135;

  const hasOverride = overrideMaxHr !== null && overrideMaxHr !== undefined && overrideMaxHr !== ''
    && Number.isFinite(Number(overrideMaxHr)) && Number(overrideMaxHr) >= 130 && Number(overrideMaxHr) <= 225;
  const effectiveMaxHr = hasOverride
    ? Math.round(Number(overrideMaxHr))
    : detectedMaxHr;

  return {
    effectiveMaxHr,
    detectedMaxHr,
    isCustomOverride: hasOverride,
    historicalAvgHr,
    peakWorkoutTitle,
    totalWorkoutsAnalyzed: combined.length,
    totalDurationSeconds: totalDurationSec,
    totalDurationFormatted: formatTime(totalDurationSec)
  };
}

/**
 * Computes the runner's 5 personalized Heart Rate Zones based on their Historical Max HR,
 * distributes their historical workout time across the 5 zones, and identifies the live zone.
 */
export function calculateHeartRateZones(maxHr = 188, extraWorkouts = [], currentLiveHr = 148, includeBaseline = true) {
  const safeMaxHr = Math.max(130, Math.min(225, Math.round(Number(maxHr) || 188)));
  const safeLiveHr = Math.max(50, Math.min(230, Math.round(Number(currentLiveHr) || 148)));

  const z1Min = Math.round(safeMaxHr * 0.50);
  const z2Min = Math.round(safeMaxHr * 0.60);
  const z3Min = Math.round(safeMaxHr * 0.70);
  const z4Min = Math.round(safeMaxHr * 0.80);
  const z5Min = Math.round(safeMaxHr * 0.90);

  const zonesTemplate = [
    {
      zone: 1,
      code: 'Z1',
      name: 'Warmup & Recovery',
      shortName: 'Recovery',
      minPct: 50,
      maxPct: 60,
      minBpm: z1Min,
      maxBpm: z2Min - 1,
      colorClass: 'bg-sky-400',
      textClass: 'text-sky-500 dark:text-sky-400',
      badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/25',
      benefit: 'Active cellular recovery, warmup capillary flow & low-stress flush'
    },
    {
      zone: 2,
      code: 'Z2',
      name: 'Aerobic Base (Target)',
      shortName: 'Aerobic Base',
      minPct: 60,
      maxPct: 70,
      minBpm: z2Min,
      maxBpm: z3Min - 1,
      colorClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/25',
      benefit: 'Mitochondrial density, fat oxidation & foundational endurance stamina'
    },
    {
      zone: 3,
      code: 'Z3',
      name: 'Aerobic Tempo',
      shortName: 'Tempo',
      minPct: 70,
      maxPct: 80,
      minBpm: z3Min,
      maxBpm: z4Min - 1,
      colorClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/25',
      benefit: 'Cardiovascular efficiency, glycogen economy & sustained cruise rhythm'
    },
    {
      zone: 4,
      code: 'Z4',
      name: 'Lactate Threshold',
      shortName: 'Threshold',
      minPct: 80,
      maxPct: 90,
      minBpm: z4Min,
      maxBpm: z5Min - 1,
      colorClass: 'bg-orange-500',
      textClass: 'text-orange-600 dark:text-orange-400',
      badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/25',
      benefit: 'Lactate clearance ceiling, fast-twitch recruitment & 5K/10K race pace'
    },
    {
      zone: 5,
      code: 'Z5',
      name: 'VO2 Max Anaerobic Peak',
      shortName: 'VO2 Peak',
      minPct: 90,
      maxPct: 100,
      minBpm: z5Min,
      maxBpm: safeMaxHr,
      colorClass: 'bg-rose-500',
      textClass: 'text-rose-600 dark:text-rose-400',
      badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/25',
      benefit: 'Maximum oxygen uptake ceiling, neuromuscular power & finishing sprint'
    }
  ];

  const validExtras = Array.isArray(extraWorkouts)
    ? extraWorkouts.filter(w => w && (Number(w.avgHeartRate) > 0 || Number(w.durationSeconds) > 0))
    : [];

  const combinedWorkouts = includeBaseline
    ? [...DEFAULT_HISTORICAL_WORKOUTS, ...validExtras]
    : (validExtras.length > 0 ? validExtras : [...DEFAULT_HISTORICAL_WORKOUTS]);

  const zoneSeconds = [0, 0, 0, 0, 0];

  combinedWorkouts.forEach((w) => {
    const dur = Math.max(60, Number(w.durationSeconds) || 1500);
    const avgHr = Number(w.avgHeartRate) || 138;
    const ratio = avgHr / safeMaxHr;

    // Distribute each run's duration realistically across warmup/cooldown and target effort zones
    let weights;
    if (ratio < 0.60) {
      // Recovery / Zone 1 dominant run
      weights = [0.72, 0.25, 0.03, 0.00, 0.00];
    } else if (ratio < 0.70) {
      // Aerobic Base / Zone 2 dominant run
      weights = [0.12, 0.78, 0.08, 0.02, 0.00];
    } else if (ratio < 0.80) {
      // Aerobic Tempo / Zone 3 run (with warmup in Z1/Z2 and surge in Z4)
      weights = [0.08, 0.36, 0.44, 0.10, 0.02];
    } else if (ratio < 0.90) {
      // Lactate Threshold / Zone 4 session (with warmup in Z1/Z2 and peak intervals in Z4/Z5)
      weights = [0.06, 0.24, 0.28, 0.30, 0.12];
    } else {
      // VO2 Max / Zone 5 race effort
      weights = [0.05, 0.15, 0.20, 0.32, 0.28];
    }

    weights.forEach((weight, idx) => {
      zoneSeconds[idx] += Math.round(dur * weight);
    });
  });

  const totalSeconds = zoneSeconds.reduce((acc, s) => acc + s, 0) || 1;

  // Compute integer percentages that always sum to 100%
  const rawPcts = zoneSeconds.map(s => (s / totalSeconds) * 100);
  const roundedPcts = rawPcts.map(p => Math.floor(p));
  const remainder = 100 - roundedPcts.reduce((a, b) => a + b, 0);
  const remaindersWithIdx = rawPcts
    .map((p, i) => ({ idx: i, frac: p - roundedPcts[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i++) {
    roundedPcts[remaindersWithIdx[i % 5].idx] += 1;
  }

  // Determine which zone the live heart rate falls into
  let liveZoneNumber = 1;
  if (safeLiveHr >= z5Min) liveZoneNumber = 5;
  else if (safeLiveHr >= z4Min) liveZoneNumber = 4;
  else if (safeLiveHr >= z3Min) liveZoneNumber = 3;
  else if (safeLiveHr >= z2Min) liveZoneNumber = 2;

  const zones = zonesTemplate.map((z, idx) => {
    const secs = zoneSeconds[idx];
    const pct = roundedPcts[idx];
    const isLiveZone = z.zone === liveZoneNumber;
    return {
      ...z,
      rangeLabel: `${z.minBpm}–${z.maxBpm} bpm`,
      pctRangeLabel: `${z.minPct}–${z.maxPct}%`,
      durationSeconds: secs,
      durationFormatted: formatTime(secs),
      percentage: pct,
      isLiveZone
    };
  });

  const activeZone = zones.find(z => z.isLiveZone) || zones[1];
  const livePctOfMax = Math.min(100, Math.max(30, Math.round((safeLiveHr / safeMaxHr) * 100)));

  return {
    maxHr: safeMaxHr,
    liveHr: safeLiveHr,
    livePctOfMax,
    activeZone,
    totalDurationSeconds: totalSeconds,
    totalDurationFormatted: formatTime(totalSeconds),
    zones
  };
}

export const ZONE_HEX_PALETTE = {
  1: { fill: '#38bdf8', stroke: '#0284c7', glow: 'rgba(56, 189, 248, 0.28)' },
  2: { fill: '#10b981', stroke: '#059669', glow: 'rgba(16, 185, 129, 0.30)' },
  3: { fill: '#f59e0b', stroke: '#d97706', glow: 'rgba(245, 158, 11, 0.30)' },
  4: { fill: '#f97316', stroke: '#ea580c', glow: 'rgba(249, 115, 22, 0.30)' },
  5: { fill: '#f43f5e', stroke: '#e11d48', glow: 'rgba(244, 63, 94, 0.32)' }
};

/**
 * Transforms calculated heart rate zone output into normalized D3.js bar chart records
 * representing weekly workout time (in minutes and formatted duration) across Z1–Z5.
 */
export function buildHrZoneChartDataset(zoneData) {
  const safeZones = Array.isArray(zoneData?.zones) ? zoneData.zones : [];
  const items = safeZones.map((z) => {
    const palette = ZONE_HEX_PALETTE[z.zone] || ZONE_HEX_PALETTE[2];
    const minutes = Math.round(((Number(z.durationSeconds) || 0) / 60) * 10) / 10;
    return {
      zone: z.zone,
      code: z.code,
      name: z.name,
      shortName: z.shortName,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
      bpmShort: `${z.minBpm}–${z.maxBpm}`,
      rangeLabel: z.rangeLabel,
      pctRangeLabel: z.pctRangeLabel,
      durationSeconds: Number(z.durationSeconds) || 0,
      minutes,
      minutesRounded: Math.round(minutes),
      durationFormatted: z.durationFormatted || formatTime(Number(z.durationSeconds) || 0),
      percentage: Number(z.percentage) || 0,
      isLiveZone: Boolean(z.isLiveZone),
      benefit: z.benefit || '',
      fillHex: palette.fill,
      strokeHex: palette.stroke,
      glowRgba: palette.glow
    };
  });

  const maxMinutes = items.reduce((max, item) => Math.max(max, item.minutes), 0);
  const totalMinutes = Math.round(items.reduce((sum, item) => sum + item.minutes, 0));

  return {
    maxHr: zoneData?.maxHr || 188,
    liveHr: zoneData?.liveHr || 148,
    totalMinutes,
    maxMinutes: Math.max(30, maxMinutes),
    totalDurationFormatted: zoneData?.totalDurationFormatted || formatTime((zoneData?.totalDurationSeconds) || 0),
    items
  };
}

