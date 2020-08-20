import { uuidv4 } from './../util';

export function build_data(config, styles, computed) {
  const { seek_ms } = styles;
  const { timeline, callbacks } = computed;
  
  return {
    kind: "controls",
    id: uuidv4(),
    rendering: {
      play: {
        id: uuidv4(),
        text: "Play"
      },
      pause: {
        id: uuidv4(),
        text: "Pause"
      },
      restart: {
        id: uuidv4(),
        text: "Restart"
      },
      manual_left: {
        id: uuidv4(),
        text: "Manual <"
      },
      manual_right: {
        id: uuidv4(),
        text: "Manual >"
      },
      progress: {
        id: uuidv4(),
        min: 0,
        start: 0,
        step: .001
      }
    },
    vars: {
      timeline: timeline,
      callbacks: callbacks,
      seek_ms: seek_ms
    }
  };
}

export function render(data) {
  const { id, rendering, vars } = data;
  const { timeline, callbacks, seek_ms } = vars;

  const div = document.createElement("div");
  div.id = id;
  div.classList.add("controls");

  const play = document.createElement("button");
  play.id = rendering.play.id;
  play.textContent = rendering.play.text;
  play.onclick = timeline.play;

  const pause = document.createElement("button");
  pause.id = rendering.pause.id;
  pause.textContent = rendering.pause.text;
  pause.onclick = timeline.pause;

  const restart = document.createElement("button");
  restart.id = rendering.restart.id;
  restart.textContent = rendering.restart.text;
  restart.onclick = timeline.restart;

  const manual_left = document.createElement("button");
  manual_left.id = rendering.manual_left.id;
  manual_left.textContent = rendering.manual_left.text;
  manual_left.onclick = () => {
    timeline.pause();
    timeline.seek(Math.max(0, timeline.currentTime - seek_ms));
  };

  // Continuously rewind animation while the rewind button is held down
  manual_left.onmousedown = () => {
    manual_left.interval = setInterval(() => {
      timeline.seek(Math.max(0, timeline.currentTime - seek_ms));
    }, 25);
  }
  manual_left.onmouseup = () => {
    if (manual_left.interval) {
      clearInterval(manual_left.interval);
    }
  }

  const manual_right = document.createElement("button");
  manual_right.id = rendering.manual_right.id;
  manual_right.textContent = rendering.manual_right.text;
  manual_right.onclick = () => {
    timeline.pause();
    timeline.seek(Math.min(timeline.duration, timeline.currentTime + seek_ms));
  };

  // Continuously play animation while the manual step forward button is held down
  manual_right.onmousedown = () => {
    manual_right.interval = setInterval(() => {
      timeline.seek(Math.max(0, timeline.currentTime + seek_ms));
    }, 25);
  }
  manual_right.onmouseup = () => {
    if (manual_right.interval) {
      clearInterval(manual_right.interval);
    }
  }

  const progress = document.createElement("input");
  progress.id = rendering.progress.id;
  progress.setAttribute("type", "range");
  progress.setAttribute("min", rendering.progress.min);
  progress.setAttribute("step", rendering.progress.step);
  progress.setAttribute("value", rendering.progress.start);
  progress.oninput = () => {
    const t = timeline.duration * (progress.valueAsNumber / 100);
    timeline.pause();
    timeline.seek(t);

    // Prevent sliding to end and back to middle completing the animation.
    if (t != timeline.duration) {
      timeline.completed = false;
    }
  };

  div.appendChild(play);
  div.appendChild(pause);
  div.appendChild(restart);
  div.appendChild(manual_left);
  div.appendChild(manual_right);
  div.appendChild(progress);

  return div;
}
