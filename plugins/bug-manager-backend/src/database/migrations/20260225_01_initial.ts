import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('bug_statuses', table => {
    table.string('id').primary();
    table.string('label').notNullable();
    table.string('color', 7).notNullable().defaultTo('#9E9E9E');
    table.integer('order').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bugs', table => {
    table.string('id').primary();
    table.string('ticket_number').notNullable().unique();
    table.string('heading', 200).notNullable();
    table.text('description').nullable();
    table
      .enum('priority', ['urgent', 'medium', 'low'])
      .notNullable()
      .defaultTo('medium');
    table
      .string('status_id')
      .notNullable()
      .references('id')
      .inTable('bug_statuses')
      .onUpdate('CASCADE');
    table.string('assignee_id').nullable();
    table.string('reporter_id').notNullable();
    table.boolean('is_closed').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bug_comments', table => {
    table.string('id').primary();
    table
      .string('bug_id')
      .notNullable()
      .references('id')
      .inTable('bugs')
      .onDelete('CASCADE');
    table.string('user_id').notNullable();
    table.text('comment_body').notNullable();
    table
      .string('parent_comment_id')
      .nullable()
      .references('id')
      .inTable('bug_comments')
      .onDelete('SET NULL');
    table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
  });

  // Seed default statuses
  const now = new Date().toISOString();
  await knex('bug_statuses').insert([
    { id: 'status-open', label: 'Open', color: '#2196F3', order: 0, created_at: now, updated_at: now },
    { id: 'status-in-progress', label: 'In Progress', color: '#FF9800', order: 1, created_at: now, updated_at: now },
    { id: 'status-in-review', label: 'In Review', color: '#9C27B0', order: 2, created_at: now, updated_at: now },
    { id: 'status-resolved', label: 'Resolved', color: '#4CAF50', order: 3, created_at: now, updated_at: now },
    { id: 'status-closed', label: 'Closed', color: '#9E9E9E', order: 4, created_at: now, updated_at: now },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bug_comments');
  await knex.schema.dropTableIfExists('bugs');
  await knex.schema.dropTableIfExists('bug_statuses');
}
