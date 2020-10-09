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
  div.classList.add("specimen-controls");

  const play = document.createElement("button");
  play.id = rendering.play.id;

  let playing = true;
  play.textContent = "Pause";
  play.addEventListener('click', (e) => {
    playing = !playing;
    if (!playing) {
      timeline.pause();
      play.textContent = "Play";
    } else {
      timeline.play();
      play.textContent = "Pause";
    }
  })

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
    playing = false;
    play.textContent = "Play";

    // Prevent sliding to end and back to middle completing the animation.
    if (t != timeline.duration) {
      timeline.completed = false;
    }
  };

  div.appendChild(play);
  div.appendChild(progress);

  return div;
}
