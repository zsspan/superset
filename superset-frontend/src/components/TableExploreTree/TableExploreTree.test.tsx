/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import type { ReactChild } from 'react';
import fetchMock from 'fetch-mock';
import { render, screen, waitFor } from 'spec/helpers/testing-library';
import userEvent from '@testing-library/user-event';
import TableExploreTree from '.';

jest.mock(
  'react-virtualized-auto-sizer',
  () =>
    ({ children }: { children: (params: { height: number }) => ReactChild }) =>
      children({ height: 500 }),
);

const mockSchemas = ['public', 'information_schema'];
const mockTables = [
  { label: 'users', value: 'users', type: 'table' },
  { label: 'orders', value: 'orders', type: 'table' },
];

beforeEach(() => {
  fetchMock.get('glob:*/api/v1/database/1/schemas/?*', {
    count: mockSchemas.length,
    result: mockSchemas,
  });
  fetchMock.get('glob:*/api/v1/database/1/tables/*', {
    count: mockTables.length,
    result: mockTables,
  });
});

afterEach(() => {
  jest.clearAllMocks();
  fetchMock.clearHistory();
});

test('renders schema list from API', async () => {
  render(<TableExploreTree dbId={1} />, { useRedux: true });

  await waitFor(() => {
    expect(screen.getByText('public')).toBeInTheDocument();
    expect(screen.getByText('information_schema')).toBeInTheDocument();
  });
});

test('renders search input and filters schemas', async () => {
  render(<TableExploreTree dbId={1} />, { useRedux: true });

  await waitFor(() => {
    expect(screen.getByText('public')).toBeInTheDocument();
  });

  const searchInput = screen.getByPlaceholderText(
    'Enter a part of the object name',
  );
  await userEvent.type(searchInput, 'info');

  await waitFor(() => {
    expect(screen.getByText('information_schema')).toBeInTheDocument();
    expect(screen.queryByText('public')).not.toBeInTheDocument();
  });
});

test('expands schema to show tables and selects table on click', async () => {
  const onSelectTable = jest.fn();
  render(
    <TableExploreTree
      dbId={1}
      showColumns={false}
      onSelectTable={onSelectTable}
    />,
    { useRedux: true },
  );

  await waitFor(() => {
    expect(screen.getByText('public')).toBeInTheDocument();
  });

  // Click public schema to expand
  await userEvent.click(screen.getByText('public'));

  await waitFor(() => {
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  // Click users table to select it
  await userEvent.click(screen.getByText('users'));

  expect(onSelectTable).toHaveBeenCalledWith({
    tableName: 'users',
    schema: 'public',
    catalog: undefined,
    dbId: 1,
  });
});

test('renders custom table extra content', async () => {
  const renderTableExtra = jest.fn(({ tableName }) =>
    tableName === 'users' ? <span>[CUSTOM-BADGE]</span> : null,
  );

  render(
    <TableExploreTree
      dbId={1}
      showColumns={false}
      renderTableExtra={renderTableExtra}
    />,
    { useRedux: true },
  );

  await waitFor(() => {
    expect(screen.getByText('public')).toBeInTheDocument();
  });

  await userEvent.click(screen.getByText('public'));

  await waitFor(() => {
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('[CUSTOM-BADGE]')).toBeInTheDocument();
  });
});
