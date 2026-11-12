import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the random token stored in the cookie
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time e-mail tokens: password reset and team invitations. */
export const tokens = pgTable("tokens", {
  // SHA-256 of the token sent by e-mail
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["reset", "invite"] }).notNull(),
  /** Required for password reset; optional for invitations shared as a link. */
  email: text("email"),
  /** Who the invitation is for (free text, shown in the team page). */
  note: text("note").notNull().default(""),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Hero class ("hero") or NPC group ("npc"). */
export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["hero", "npc"] }).notNull(),
  color: text("color").notNull().default("#6b7280"),
  hp: integer("hp"),
  passive: text("passive").notNull().default(""),
  description: text("description").notNull().default(""),
  subgroups: jsonb("subgroups").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: ["player", "npc"] }).notNull(),
    /** null = obecná karta (pro všechny) */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    data: jsonb("data").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cards_class_idx").on(t.classId)],
);

export type UserRow = typeof users.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
