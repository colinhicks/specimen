import cloneDeep from "lodash/cloneDeep";

export function pack(component, ids = {}) {
  const target = cloneDeep(component);

  if (target.children) {
    Object.entries(target.children).forEach(([ name, sub ]) => {
      
      if (Array.isArray(sub)) {
        sub.forEach((s, i) => {
          ids = pack(s, ids);
          target.children[name][i] = s.id;
        });
      } else {
        ids = pack(sub, ids);
        target.children[name] = sub.id;
      }
    });
  }

  ids[target.id] = target;
  return ids;
}

export function unpack(by_id, id) {
  const component = cloneDeep(by_id[id]);

  if (component.children) {
    const children = component.children;
    const unpacked_children = {};

    Object.entries(children).forEach(([ name, sub ]) => {
      if (Array.isArray(sub)) {
        unpacked_children[name] = [];

        sub.forEach(s => {
          unpacked_children[name].push(unpack(by_id, s));
        });
      } else {
        unpacked_children[name] = unpack(by_id, sub);
      }
    });

    component.children = unpacked_children;
  }

  return component;
}

export function index_by_id(layout) {
  return layout.reduce((ids, comp) => pack(comp, ids), {})
}

export function index_by_name(by_id) {
  return Object.values(by_id)
    .reduce((all, comp) => {
      if (comp.name) {
        all[comp.name] = comp.id;
      }
      return all;
    }, {});
}
