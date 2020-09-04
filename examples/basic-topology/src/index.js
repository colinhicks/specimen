import { Specimen } from '../../../src/index';

import hljs from 'highlight.js/lib/core';
import ksql from '../../../src/ksql-highlightjs';
import hljs_js from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('sql', ksql);
hljs.registerLanguage('javascript', hljs_js);
hljs.initHighlightingOnLoad();

Object.defineProperty(String.prototype, 'hashCode', {
  value: function() {
    var hash = 0, i, chr;
    for (i = 0; i < this.length; i++) {
      chr   = this.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }
});

const flavors = [
  "#0074A2",
  "#F26135",
  "#FFC40C"
];

function stream(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 150,
    pq_height: 150,
    pq_margin_top: 50,
    pq_bracket_len: 25,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_bracket_len: 10,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    render_controls: false
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.render();
}

function inserts(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 150,
    pq_height: 150,
    pq_margin_top: 50,
    pq_bracket_len: 25,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_bracket_len: 10,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    render_controls: false
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 25 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
        { key: "buyer-3", value: { amount: 42, country: "grc" }, t: 42 },
        { key: "buyer-3", value: { amount: 40, country: "grc" }, t: 45 }
      ],
      [
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 10 },
        { key: "buyer-6", value: { amount: 43, country: "grc" }, t: 26 },
        { key: "buyer-5", value: { amount: 41, country: "usa" }, t: 31 },
        { key: "buyer-5", value: { amount: 42, country: "usa" }, t: 43 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },

      ],
      [
        { key: "buyer-7", value: { amount: 43, country: "grc" }, t: 12 },
        { key: "buyer-8", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-9", value: { amount: 40, country: "eth" }, t: 30 },
        { key: "buyer-9", value: { amount: 44, country: "eth" }, t: 55 },
        { key: "buyer-7", value: { amount: 41, country: "grc" }, t: 53 }
      ]
    ]
  });

  s.render();
}

function transformation(container) {
  const styles = {
    svg_width: 750,
    svg_height: 325,

    pq_width: 150,
    pq_height: 150,
    pq_margin_top: 50,
    pq_bracket_len: 25,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 200,
    part_height: 50,
    part_bracket_len: 10,
    part_margin_bottom: 20,
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 15,
    row_height: 15,
    row_margin_left: 8,
    row_offset_right: 10,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 25 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
        { key: "buyer-3", value: { amount: 42, country: "grc" }, t: 42 },
        { key: "buyer-3", value: { amount: 40, country: "grc" }, t: 45 }
      ],
      [
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 10 },
        { key: "buyer-6", value: { amount: 43, country: "grc" }, t: 26 },
        { key: "buyer-5", value: { amount: 41, country: "usa" }, t: 31 },
        { key: "buyer-5", value: { amount: 42, country: "usa" }, t: 43 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },

      ],
      [
        { key: "buyer-7", value: { amount: 43, country: "grc" }, t: 12 },
        { key: "buyer-8", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-9", value: { amount: 40, country: "eth" }, t: 30 },
        { key: "buyer-9", value: { amount: 44, country: "eth" }, t: 55 },
        { key: "buyer-7", value: { amount: 41, country: "grc" }, t: 53 }
      ]
    ]
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "clean",
    query_text: [
      "CREATE STREAM clean AS",
      "    SELECT buyer,",
      "           amount,",
      "           UCASE(country) AS country",
      "    FROM orders",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "clean",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.render();
}

function filtering(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 12,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 25 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
        { key: "buyer-3", value: { amount: 42, country: "grc" }, t: 42 },
        { key: "buyer-3", value: { amount: 40, country: "grc" }, t: 45 }
      ],
      [
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 10 },
        { key: "buyer-6", value: { amount: 43, country: "grc" }, t: 26 },
        { key: "buyer-5", value: { amount: 41, country: "usa" }, t: 31 },
        { key: "buyer-5", value: { amount: 42, country: "usa" }, t: 43 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },

      ],
      [
        { key: "buyer-7", value: { amount: 43, country: "grc" }, t: 12 },
        { key: "buyer-8", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-9", value: { amount: 40, country: "eth" }, t: 30 },
        { key: "buyer-9", value: { amount: 44, country: "eth" }, t: 55 },
        { key: "buyer-7", value: { amount: 41, country: "grc" }, t: 53 }
      ]
    ]
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "clean",
    query_text: [
      "CREATE STREAM clean AS",
      "    SELECT buyer,",
      "           amount,",
      "           UCASE(country) AS country",
      "    FROM orders",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "clean",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["clean"], {
    name: "pq2",
    kind: "persistent_query",
    into: "big_orders",
    query_text: [
      "CREATE STREAM big_orders AS",
      "    SELECT buyer, amount, country",
      "    FROM clean",
      "    WHERE amount > 41",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount > 41;
    },
  });

  s.add_child(["pq2"], {
    name: "big_orders",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

function compressed(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 12,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 25 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
        { key: "buyer-3", value: { amount: 42, country: "grc" }, t: 42 },
        { key: "buyer-3", value: { amount: 40, country: "grc" }, t: 45 }
      ],
      [
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 10 },
        { key: "buyer-6", value: { amount: 43, country: "grc" }, t: 26 },
        { key: "buyer-5", value: { amount: 41, country: "usa" }, t: 31 },
        { key: "buyer-5", value: { amount: 42, country: "usa" }, t: 43 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },

      ],
      [
        { key: "buyer-7", value: { amount: 43, country: "grc" }, t: 12 },
        { key: "buyer-8", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-9", value: { amount: 40, country: "eth" }, t: 30 },
        { key: "buyer-9", value: { amount: 44, country: "eth" }, t: 55 },
        { key: "buyer-7", value: { amount: 41, country: "grc" }, t: 53 }
      ]
    ]
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "high_pri",
    query_text: [
      "CREATE STREAM high_pri AS",
      "    SELECT buyer,",
      "           amount,",
      "           UCASE(country) AS country",
      "    FROM orders",
      "    WHERE amount > 41",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount > 41;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "high_pri",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

function rekeying(container) {
  const styles = {
    svg_width: 750,
    svg_height: 275,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 30,
    part_id_margin_left: -15,
    part_id_margin_top: 12,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 25 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
        { key: "buyer-3", value: { amount: 42, country: "grc" }, t: 42 },
        { key: "buyer-3", value: { amount: 40, country: "grc" }, t: 45 }
      ],
      [
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 10 },
        { key: "buyer-6", value: { amount: 43, country: "grc" }, t: 26 },
        { key: "buyer-5", value: { amount: 41, country: "usa" }, t: 31 },
        { key: "buyer-5", value: { amount: 42, country: "usa" }, t: 43 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },

      ],
      [
        { key: "buyer-7", value: { amount: 43, country: "grc" }, t: 12 },
        { key: "buyer-8", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-9", value: { amount: 40, country: "eth" }, t: 30 },
        { key: "buyer-9", value: { amount: 44, country: "eth" }, t: 55 },
        { key: "buyer-7", value: { amount: 41, country: "grc" }, t: 53 }
      ]
    ]
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "high_pri",
    query_text: [
      "CREATE STREAM high_pri AS",
      "    SELECT buyer,",
      "           amount,",
      "           UCASE(country) AS country",
      "    FROM orders",
      "    WHERE amount > 41",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount > 41;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "high_pri",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["high_pri"], {
    name: "pq2",
    kind: "persistent_query",
    into: "by_country",
    query_text: [
      "CREATE STREAM by_country AS",
      "    SELECT *",
      "    FROM high_pri",
      "    PARTITION BY country",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.country.hashCode();
    }
  });

  s.add_child(["pq2"], {
    name: "by_country",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

function consumers(container) {
  const styles = {
    svg_width: 750,
    svg_height: 675,

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_bracket_len: 15,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,

    coll_label_margin_bottom: 50,

    part_width: 100,
    part_height: 25,
    part_bracket_len: 5,
    part_margin_bottom: 60,
    part_id_margin_left: -15,
    part_id_margin_top: 12,

    row_width: 10,
    row_height: 10,
    row_margin_left: 8,
    row_offset_right: 8,

    ms_px: 5
  };

  const s = new Specimen(container, styles);

  s.add_root({
    name: "orders",
    kind: "stream",
    partitions: [
      [
        { key: "buyer-1", value: { amount: 45, country: "usa" }, t: 11 },
        { key: "buyer-2", value: { amount: 41, country: "eth" }, t: 25 },
        { key: "buyer-1", value: { amount: 42, country: "usa" }, t: 34 },
        { key: "buyer-3", value: { amount: 42, country: "grc" }, t: 42 },
        { key: "buyer-3", value: { amount: 40, country: "grc" }, t: 45 }
      ],
      [
        { key: "buyer-4", value: { amount: 43, country: "eth" }, t: 10 },
        { key: "buyer-6", value: { amount: 43, country: "grc" }, t: 26 },
        { key: "buyer-5", value: { amount: 41, country: "usa" }, t: 31 },
        { key: "buyer-5", value: { amount: 42, country: "usa" }, t: 43 },
        { key: "buyer-4", value: { amount: 41, country: "eth" }, t: 57 },

      ],
      [
        { key: "buyer-7", value: { amount: 43, country: "grc" }, t: 12 },
        { key: "buyer-8", value: { amount: 40, country: "usa" }, t: 22 },
        { key: "buyer-9", value: { amount: 40, country: "eth" }, t: 30 },
        { key: "buyer-9", value: { amount: 44, country: "eth" }, t: 55 },
        { key: "buyer-7", value: { amount: 41, country: "grc" }, t: 53 }
      ]
    ]
  });

  s.add_child(["orders"], {
    name: "pq1",
    kind: "persistent_query",
    into: "high_pri",
    query_text: [
      "CREATE STREAM high_pri AS",
      "    SELECT buyer,",
      "           amount,",
      "           UCASE(country) AS country",
      "    FROM orders",
      "    WHERE amount > 41",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    where: function(context, row) {
      return row.value.amount > 41;
    },
    style: {
      fill: function(before_row, after_row) {
        return flavors[before_row.value.country.hashCode() % flavors.length];
      }
    }
  });

  s.add_child(["pq1"], {
    name: "high_pri",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["high_pri"], {
    name: "pq2",
    kind: "persistent_query",
    into: "by_country",
    query_text: [
      "CREATE STREAM by_country AS",
      "    SELECT *",
      "    FROM high_pri",
      "    PARTITION BY country",
      "    EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return before_row.value.country.hashCode();
    }
  });

  s.add_child(["pq2"], {
    name: "by_country",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });

  s.add_child(["high_pri"], {
    name: "pq3",
    kind: "persistent_query",
    into: "by_zone",
    query_text: [
      "CREATE STREAM s1_by_country AS",
      "  SELECT buyer,",
      "         amount,",
      "          UCASE(country) AS country",
      "  FROM s2",
      "  EMIT CHANGES;"
    ],
    select: function(row) {
      return row;
    },
    partition_by: function(context, before_row, after_row) {
      return (before_row.value.country + " ").hashCode();
    }
  });

  s.add_child(["pq3"], {
    name: "by_zone",
    kind: "stream",
    partitions: [
      [],
      [],
      []
    ]
  });
  
  s.render();
}

stream("#stream");
inserts("#inserts");
transformation("#transformation");
filtering("#filtering");
compressed("#compressed");
rekeying("#rekeying");
consumers("#multi-consumer");
