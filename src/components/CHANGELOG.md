# Changelog

## 2.1.1

Grids with only one row no longer incorrectly set cell height to 100%.

## 2.1.0

Improved ARIA support:

- Add better default ARIA attributes for outer `HTMLDivElement`
- Add optional `ariaAttributes` prop to row and cell renderers to simplify better ARIA attributes for user-rendered cells
- Remove intermediate `HTMLDivElement` from `List` and `Grid`
  - This may enable more/better custom CSS styling
  - This may also enable adding an optional `children` prop to `List` and `Grid` for e.g. overlays/tooltips
- Add optional `tagName` prop; defaults to `"div"` but can be changed to e.g. `"ul"`

```tsx
// Example of how to use new `ariaAttributes` prop
function RowComponent({
  ariaAttributes,
  index,
  style,
  ...rest
}: RowComponentProps<object>) {
  return (
    <div style={style} {...ariaAttributes}>
      ...
    </div>
  );
}
```

Added optional `children` prop to better support edge cases like sticky rows.

Minor changes to `onRowsRendered` and `onCellsRendered` callbacks to make it easier to differentiate between _visible_ items and items rendered due to overscan settings. These methods will now receive two params– the first for _visible_ rows and the second for _all_ rows (including overscan), e.g.:

```ts
function onRowsRendered(
  visibleRows: {
    startIndex: number;
    stopIndex: number;
  },
  allRows: {
    startIndex: number;
    stopIndex: number;
  }
): void {
  // ...
}

function onCellsRendered(
  visibleCells: {
    columnStartIndex: number;
    columnStopIndex: number;
    rowStartIndex: number;
    rowStopIndex: number;
  },
  allCells: {
    columnStartIndex: number;
    columnStopIndex: number;
    rowStartIndex: number;
    rowStopIndex: number;
  }
): void {
  // ...
}
```

## 2.0.2

Fixed edge-case bug with `Grid` imperative API `scrollToCell` method and "smooth" scrolling behavior.

## 2.0.1

- Remove ARIA `role` attribute from `List` and `Grid`. This resulted in potentially invalid configurations (e.g. a ARIA _list_ should contain at least one _listitem_ but that was not enforced by this library). Users of this library should specify the `role` attribute that makes the most sense to them [based on mdn guidelines](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/list_role#best_practices). For example:

```tsx
<List
  role="list"
  rowComponent={RowComponent}
  rowCount={names.length}
  rowHeight={25}
  rowProps={{ names }}
/>;

function RowComponent({ index, style, ...rest }: RowComponentProps<object>) {
  return (
    <div role="listitem" style={style}>
      ...
    </div>
  );
}
```

# 2.0.0

Version 2 is a major rewrite that offers the following benefits:

- More ergonomic props API
- Automatic memoization of row/cell renderers and props/context
- Automatically sizing for `List` and `Grid` (no more need for `AutoSizer`)
- Native TypeScript support (no more need for `@types/react-window`)
- Smaller bundle size

## Upgrade path

This section contains a couple of examples for common upgrade paths. Please refer to the [documentation](https://react-window.vercel.app/) for more information.

### Migrating `FixedSizeList`

#### Before

```tsx
import { FixedSizeList, type ListChildComponentProps } from "react-window";

function Example({ names }: { names: string[] }) {
  const itemData = useMemo<ItemData>(() => ({ names }), [names]);

  return (
    <FixedSizeList
      children={Row}
      height={150}
      itemCount={1000}
      itemData={itemData}
      itemSize={25}
      width={300}
    />
  );
}

function Row({
  data,
  index,
  style
}: ListChildComponentProps<{
  names: string[];
}>) {
  const { names } = data;
  const name = names[index];
  return <div style={style}>{name}</div>;
}
```

#### After

```tsx
import { List, type RowComponentProps } from "react-window";

function Example({ names }: { names: string[] }) {
  // You don't need to useMemo for rowProps;
  // List will automatically memoize them
  return (
    <List
      rowComponent={RowComponent}
      rowCount={names.length}
      rowHeight={25}
      rowProps={{ names }}
    />
  );
}

function RowComponent({
  index,
  names,
  style
}: RowComponentProps<{
  names: string[];
}>) {
  const name = names[index];
  return <div style={style}>{name}</div>;
}
```

### Migrating `VariableSizedList`

#### Before

```tsx
import { VariableSizeList, type ListChildComponentProps } from "react-window";

function Example({ items }: { items: Item[] }) {
  const itemData = useMemo<ItemData>(() => ({ items }), [items]);
  const itemSize = useCallback(
    (index: number) => {
      const item = itemData.items[index];
      return item.type === "header" ? 40 : 20;
    },
    [itemData]
  );

  return (
    <VariableSizeList
      children={Row}
      height={150}
      itemCount={1000}
      itemData={itemData}
      itemSize={itemSize}
      width={300}
    />
  );
}

function itemSize();

function Row({
  data,
  index,
  style
}: ListChildComponentProps<{
  items: Item[];
}>) {
  const { items } = data;
  const item = items[index];
  return <div style={style}>{item.label}</div>;
}
```

#### After

```tsx
import { List, type RowComponentProps } from "react-window";

type RowProps = {
  items: Item[];
};

function Example({ items }: { items: Item[] }) {
  // You don't need to useMemo for rowProps;
  // List will automatically memoize them
  return (
    <List
      rowComponent={RowComponent}
      rowCount={items.length}
      rowHeight={rowHeight}
      rowProps={{ items }}
    />
  );
}

// The rowHeight method also receives the extra props,
// so it can be defined at the module level
function rowHeight(index: number, { item }: RowProps) {
  return item.type === "header" ? 40 : 20;
}

function RowComponent({ index, items, style }: RowComponentProps<RowProps>) {
  const item = items[index];
  return <div style={style}>{item.label}</div>;
}
```

### Migrating `FixedSizeGrid`

#### Before

```tsx
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";

function Example({ data }: { data: Data[] }) {
  const itemData = useMemo<ItemData>(() => ({ data }), [data]);

  return (
    <FixedSizeGrid
      children={Cell}
      columnCount={data[0]?.length ?? 0}
      columnWidth={100}
      height={150}
      itemData={itemData}
      rowCount={data.length}
      rowHeight={35}
      width={300}
    />
  );
}

function Cell({
  columnIndex,
  data,
  rowIndex,
  style
}: GridChildComponentProps<{
  names: string[];
}>) {
  const { data } = data;
  const datum = data[index];
  return <div style={style}>...</div>;
}
```

#### After

```tsx
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";

function Example({ data }: { data: Data[] }) {
  // You don't need to useMemo for cellProps;
  // Grid will automatically memoize them
  return (
    <Grid
      cellComponent={Cell}
      cellProps={{ data }}
      columnCount={data[0]?.length ?? 0}
      columnWidth={75}
      rowCount={data.length}
      rowHeight={25}
    />
  );
}

function Cell({
  columnIndex,
  data,
  rowIndex,
  style
}: CellComponentProps<{
  data: Data[];
}>) {
  const datum = data[rowIndex][columnIndex];
  return <div style={style}>...</div>;
}
```

### Migrating `VariableSizeGrid`

#### Before

```tsx
import { VariableSizeGrid, type GridChildComponentProps } from "react-window";

function Example({ data }: { data: Data[] }) {
  const itemData = useMemo<ItemData>(() => ({ data }), [data]);

  const columnWidth = useCallback(
    (columnIndex: number) => {
      // ...
    },
    [itemData]
  );

  const rowHeight = useCallback(
    (rowIndex: number) => {
      // ...
    },
    [itemData]
  );

  return (
    <VariableSizeGrid
      children={Cell}
      columnCount={data[0]?.length ?? 0}
      columnWidth={columnWidth}
      height={150}
      itemData={itemData}
      rowCount={data.length}
      rowHeight={rowHeight}
      width={300}
    />
  );
}

function Cell({
  columnIndex,
  data,
  rowIndex,
  style
}: GridChildComponentProps<{
  names: string[];
}>) {
  const { data } = data;
  const datum = data[index];
  return <div style={style}>...</div>;
}
```

#### After

```tsx
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";

type CellProps = {
  data: Data[];
};

function Example({ data }: { data: Data[] }) {
  // You don't need to useMemo for cellProps;
  // Grid will automatically memoize them
  return (
    <Grid
      cellComponent={Cell}
      cellProps={{ data }}
      columnCount={data[0]?.length ?? 0}
      columnWidth={columnWidth}
      rowCount={data.length}
      rowHeight={rowHeight}
    />
  );
}

// The columnWidth method also receives the extra props,
// so it can be defined at the module level
function columnWidth(columnIndex: number, { data }: CellProps) {
  // ...
}

// The rowHeight method also receives the extra props,
// so it can be defined at the module level
function rowHeight(rowIndex: number, { data }: CellProps) {
  // ...
}

function Cell({
  columnIndex,
  data,
  rowIndex,
  style
}: CellComponentProps<CellProps>) {
  const datum = data[rowIndex][columnIndex];
  return <div style={style}>...</div>;
}
```

### ⚠️ Version 2 requirements

The following requirements are new in version 2 and may be reasons to consider _not_ upgrading:

- Peer dependencies now require React version 18 or newer
- `ResizeObserver` primitive (or polyfill) is required _unless_ explicit pixel dimensions are provided via `style` prop; (see documentation for more)

## 1.8.11

- Dependencies updated to include React 19

## 1.8.10

- Fix scrollDirection when direction is RTL (#690)

## 1.8.9

- Readme changes

## 1.8.8

- 🐛 `scrollToItem` accounts for scrollbar size in the uncommon case where a List component has scrolling in the non-dominant direction (e.g. a "vertical" layout list also scrolls horizontally).

## 1.8.7

- ✨ Updated peer dependencies to include React v18.

## 1.8.6

- ✨ Updated peer dependencies to include React v17.

## 1.8.5

- ✨ Added UMD (dev and prod) build - ([emmanueltouzery](https://github.com/emmanueltouzery) - [#281](https://github.com/bvaughn/react-window/pull/281))

## 1.8.4

- 🐛 Fixed size list and grid components now accurately report `visibleStopIndex` in `onItemsRendered`. (Previously this value was incorrectly reported as one index higher.) - ([justingrant](https://github.com/justingrant) - [#274](https://github.com/bvaughn/react-window/pull/274))
- 🐛 Fixed size list and grid components `scrollToItem` "center" mode when the item being scrolled to is near the viewport edge. - ([justingrant](https://github.com/justingrant) - [#274](https://github.com/bvaughn/react-window/pull/274))

## 1.8.3

- 🐛 Edge case bug-fix for `scrollToItem` when scrollbars are present ([MarkFalconbridge](https://github.com/MarkFalconbridge) - [#267](https://github.com/bvaughn/react-window/pull/267))
- 🐛 Fixed RTL scroll offsets for non-Chromium Edge ([MarkFalconbridge](https://github.com/MarkFalconbridge) - [#268](https://github.com/bvaughn/react-window/pull/268))
- 🐛 Flow types improved ([TrySound](https://github.com/TrySound) - [#260](https://github.com/bvaughn/react-window/pull/260))

## 1.8.2

- ✨ Deprecated grid props `overscanColumnsCount` and `overscanRowsCount` props in favor of more consistently named `overscanColumnCount` and `overscanRowCount`. ([nihgwu](https://github.com/nihgwu) - [#229](https://github.com/bvaughn/react-window/pull/229))
- 🐛 Fixed shaky elastic scroll problems present in iOS Safari. [#244](https://github.com/bvaughn/react-window/issues/244)
- 🐛 Fixed RTL edge case bugs and broken scroll-to-item behavior. [#159](https://github.com/bvaughn/react-window/issues/159)
- 🐛 Fixed broken synchronized scrolling for RTL lists/grids. [#198](https://github.com/bvaughn/react-window/issues/198)

## 1.8.1

- 🐛 Replaced an incorrect empty-string value for `pointer-events` with `undefined` ([oliviertassinari](https://github.com/oliviertassinari) - [#210](https://github.com/bvaughn/react-window/pull/210))

## 1.8.0

- 🎉 Added new "smart" align option for grid and list scroll-to-item methods ([gaearon](https://github.com/gaearon) - [#209](https://github.com/bvaughn/react-window/pull/209))

## 1.7.2

- 🐛 Add guards to avoid invalid scroll offsets when `scrollTo()` is called with a negative offset or when `scrollToItem` is called with invalid indices (negative or too large).

## 1.7.1

- 🐛 Fix SSR regression introduced in 1.7.0 - ([Betree](https://github.com/Betree) - [#185](https://github.com/bvaughn/react-window/pull/185))

## 1.7.0

- 🎉 Grid `scrollToItem` supports optional `rowIndex` and `columnIndex` params ([jgoz](https://github.com/jgoz) - [#174](https://github.com/bvaughn/react-window/pull/174))
- DEV mode checks for `WeakSet` support before using it to avoid requiring a polyfill for IE11 - ([jgoz](https://github.com/jgoz) - [#167](https://github.com/bvaughn/react-window/pull/167))

## 1.6.2

- 🐛 Bugfix for RTL when scrolling back towards the beginning (right) of the list.

## 1.6.1

- 🐛 Bugfix to account for differences between Chrome and non-Chrome browsers with regard to RTL and "scroll" events.

## 1.6.0

- 🎉 RTL support added for lists and grids. Special thanks to [davidgarsan](https://github.com/davidgarsan) for his support. - [#156](https://github.com/bvaughn/react-window/pull/156)
- 🐛 Grid `scrollToItem` methods take scrollbar size into account when aligning items - [#153](https://github.com/bvaughn/react-window/issues/153)

## 1.5.2

- 🐛 Edge case bug fix for `VariableSizeList` and `VariableSizeGrid` when the number of items decreases while a scroll is in progress. - ([iamsolankiamit](https://github.com/iamsolankiamit) - [#138](https://github.com/bvaughn/react-window/pull/138))

## 1.5.1

- 🐛 Updated `getDerivedState` Flow annotations to address a warning in a newer version of Flow.

## 1.5.0

- 🎉 Added advanced memoization helpers methods `areEqual` and `shouldComponentUpdate` for item renderers. - [#114](https://github.com/bvaughn/react-window/issues/114)

## 1.4.0

- 🎉 List and Grid components now "overscan" (pre-render) in both directions when scrolling is not active. When scrolling is in progress, cells are only pre-rendered in the direction being scrolled. This change has been made in an effort to reduce visible flicker when scrolling starts without adding additional overhead during scroll (which is the most performance sensitive time).
- 🎉 Grid components now support separate `overscanColumnsCount` and `overscanRowsCount` props. Legacy `overscanCount` prop will continue to work, but with a deprecation warning in DEV mode.
- 🐛 Replaced `setTimeout` with `requestAnimationFrame` based timer, to avoid starvation issue for `isScrolling` reset. - [#106](https://github.com/bvaughn/react-window/issues/106)
- 🎉 Renamed List and Grid `innerTagName` and `outerTagName` props to `innerElementType` and `outerElementType` to formalize support for attaching arbitrary props (e.g. test ids) to List and Grid inner and outer DOM elements. Legacy `innerTagName` and `outerTagName` props will continue to work, but with a deprecation warning in DEV mode.
- 🐛 List re-renders items if `direction` prop changes. - [#104](https://github.com/bvaughn/react-window/issues/104)

## 1.3.1

- 🎉 Pass `itemData` value to custom `itemKey` callbacks when present - [#90](https://github.com/bvaughn/react-window/issues/90))

## 1.3.0

- (Skipped)

## 1.2.4

- 🐛 Added Flow annotations to memoized methods to avoid a Flow warning for newer versions of Flow

## 1.2.3

- 🐛 Relaxed `children` validation checks. They were too strict and didn't support new React APIs like `memo`.

## 1.2.2

- 🐛 Improved Flow types for class component item renderers - ([nicholas-l](https://github.com/nicholas-l) - [#77](https://github.com/bvaughn/react-window/pull/77))

## 1.2.1

- 🎉 Improved Flow types to include optional `itemData` parameter. ([TrySound](https://github.com/TrySound) - [#66](https://github.com/bvaughn/react-window/pull/66))
- 🐛 `VariableSizeList` and `VariableSizeGrid` no longer call size getter functions with invalid index when item count is zero.

## 1.2.0

- 🎉 Flow types added to NPM package. ([TrySound](https://github.com/TrySound) - [#40](https://github.com/bvaughn/react-window/pull/40))
- 🎉 Relaxed grid `scrollTo` method to make `scrollLeft` and `scrollTop` params _optional_ (so you can only update one axis if desired). - [#63](https://github.com/bvaughn/react-window/pull/63))
- 🐛 Fixed invalid `this` pointer in `VariableSizeGrid` that broke the `resetAfter*` methods - [#58](https://github.com/bvaughn/react-window/pull/58))
- Upgraded to babel 7 and used shared runtime helpers to reduce package size slightly. ([TrySound](https://github.com/TrySound) - [#48](https://github.com/bvaughn/react-window/pull/48))
- Remove `overflow:hidden` from inner container ([souporserious](https://github.com/souporserious) - [#56](https://github.com/bvaughn/react-window/pull/56))

## 1.1.2

- 🐛 Fixed edge case `scrollToItem` bug that caused lists/grids with very few items to have negative scroll offsets.

## 1.1.1

- 🐛 `FixedSizeGrid` and `FixedSizeList` automatically clear style cache when item size props change.

## 1.1.0

- 🎉 Use explicit `constructor` and `super` to generate cleaner component code. ([Andarist](https://github.com/Andarist) - [#26](https://github.com/bvaughn/react-window/pull/26))
- 🎉 Add optional `shouldForceUpdate` param reset-index methods to specify `forceUpdate` behavior. ([nihgwu](https://github.com/nihgwu) - [#32](https://github.com/bvaughn/react-window/pull/32))

## 1.0.3

- 🐛 Avoid unnecessary scrollbars for lists (e.g. no horizontal scrollbar for a vertical list) unless content requires them.

## 1.0.2

- 🎉 Enable Babel `annotate-pure-calls` option so that classes compiled by "transform-es2015-classes" are annotated with `#__PURE__`. This enables [UglifyJS to remove them if they are not referenced](https://github.com/mishoo/UglifyJS2/pull/1448), improving dead code elimination in application code. ([Andarist](https://github.com/Andarist) - [#20](https://github.com/bvaughn/react-window/pull/20))
- 🎉 Update "rollup-plugin-peer-deps-external" and use new `includeDependencies` flag so that the "memoize-one" dependency does not get inlined into the Rollup bundle. ([Andarist](https://github.com/Andarist) - [#19](https://github.com/bvaughn/react-window/pull/19))
- 🎉 Enable [Babel "loose" mode](https://babeljs.io/docs/en/babel-preset-env#loose) to reduce package size (-8%). ([Andarist](https://github.com/Andarist) - [#18](https://github.com/bvaughn/react-window/pull/18))

## 1.0.1

Updated `README.md` file to remove `@alpha` tag from NPM installation instructions.

# 1.0.0

Initial release of library. Includes the following components:

- `FixedSizeGrid`
- `FixedSizeList`
- `VariableSizeGrid`
- `VariableSizeList`


Grids
Rendering a grid
Use the Grid component to render data with many rows and columns:
DrAlgernonRobersarobers1q@pinterest.comMale16 Ludington PlazaSan Luis ObispoCalifornia93407
DrAntonettaGwiltagwilt1e@sitemeter.comFemale0 Butternut ParkSan Luis ObispoCalifornia93407
DrBeniaminoWorlidgebworlidge5g@google.plMale7620 Hovde StreetSeattleWashington98175
DrBinkyCurnowbcurnow5@stanford.eduMale2868 Main WayScottsdaleArizona85271
DrBobbyeDobelbdobel6d@twitter.comFemale4 Chinook TerraceBuffaloNew York14233
DrBordyWhalebwhale19@bloglovin.comMale76705 Bowman JunctionWashingtonDistrict of Columbia20057
DrBroddyBilsfordbbilsford7c@toplist.czPolygender0042 Swallow CourtPortlandOregon97255
DrCatleeEsslemontcesslemont18@army.milFemale120 Muir StreetRaleighNorth Carolina27615
Grids require you to specify the number of rows and columns as well as the width and height of each:
import { Grid } from "react-window";
function Example({ contacts }: { contacts: Contact[] }) {
return (
<Grid
cellComponent={CellComponent}
cellProps={{ contacts }}
columnCount={10}
columnWidth={columnWidth}
rowCount={contacts.length}
rowHeight={25}
/>
);
}
Column widths and row heights can be either numbers or functions. In the example above, row height is fixed and column width is function that determines the width of the column based on the column index:
function columnWidth(index: number) {
switch (indexToColumn(index)) {
case "address": {
return 250;
}
case "email": {
return 300;
}
case "job_title": {
return 150;
}
case "timezone": {
return 200;
}
case "zip": {
return 75;
}
default: {
return 100;
}
}
}
Lastly grids require a component to render cell, given a column and row index. As with lists, this component receives additional props specified as part of cellProps:
import { type CellComponentProps } from "react-window";
function CellComponent({
contacts,
columnIndex,
rowIndex,
style
}: CellComponentProps<{
contacts: Contact[];
}>) {
const address = contacts[rowIndex];
const content = address[indexToColumn(columnIndex)];
return (
<div className="truncate" style={style}>
{content}
</div>
);
}
Grids require space to render cells. Typically the ResizeObserver API is used to determine how much space there is available within the parent DOM element.
If an explicit width and height are specified (in pixels) using the style prop, ResizeObserver will not be used.
Continue to component props…

Lists
Fixed row heights
The simplest type of list to render is one with fixed row heights.
Aaden
1 of 1000
Aarav
2 of 1000
Aaron
3 of 1000
Abdiel
4 of 1000
Abdullah
5 of 1000
Abel
6 of 1000
Abraham
7 of 1000
Abram
8 of 1000
Ace
9 of 1000
To render this type of list, you need to specify how many rows it contains (rowCount), which component should render rows (rowComponent), and the height of each row (rowHeight):
import { List } from "react-window";
function Example({ names }: { names: string[] }) {
return (
<List
rowComponent={RowComponent}
rowCount={names.length}
rowHeight={25}
rowProps={{ names }}
/>
);
}
The rowProps object can also be used to share between components. Values passed in rowProps will also be passed as props to the row component:
import { type RowComponentProps } from "react-window";
function RowComponent({
index,
names,
style
}: RowComponentProps<{
names: string[];
}>) {
return (
<div className="flex items-center justify-between" style={style}>
{names[index]}
<div className="text-slate-500 text-xs">{`${index + 1} of ${names.length}`}</div>
</div>
);
}
Lists require vertical space to render rows. Typically the ResizeObserver API is used to determine how much space there is available within the parent DOM element.
If an explicit height is specified (in pixels) using the style prop, ResizeObserver will not be used.
Continue to variable row heights…

Lists
Variable row heights
Lists with rows of different types may require different heights to render.
Here is an example the most populous US postal codes, grouped by state. State rows "headers" are taller and are styled differently.
Alabama
1 of 4838
Alabaster, 35007
2 of 4838
Athens, 35611
3 of 4838
Athens, 35613
4 of 4838
Auburn, 36830
5 of 4838
Bessemer, 35020
6 of 4838
Birmingham, 35209
7 of 4838
Birmingham, 35215
8 of 4838
Birmingham, 35216
9 of 4838
This list requires a rowHeight function that tells it what height a row should be based on the type of data it contains.
import {
List,
type ListImperativeAPI,
type RowComponentProps
} from "react-window";
type Item =
| { type: "state"; state: string }
| { type: "zip"; city: string; zip: string };
type RowProps = {
items: Item[];
};
function Example({ items }: { items: Item[] }) {
return (
<List<RowProps>
rowComponent={RowComponent}
rowCount={items.length}
rowHeight={rowHeight}
rowProps={{ items }}
/>
);
}
function rowHeight(index: number, { items }: RowProps) {
switch (items[index].type) {
case "state": {
return 30;
}
case "zip": {
return 25;
}
}
}
function RowComponent({ index, items, style }: RowComponentProps<RowProps>) {
const item = items[index];
const className = getClassName(item);
return (
<div className={className} style={style}>
{item.type === "state" ? (
<span>{item.state}</span>
) : (
<span>
{item.city}, {item.zip}
</span>
)}
<div className="text-slate-500 text-xs">{`${index + 1} of ${items.length}`}</div>
</div>
);
}
Continue to component props…

Lists
Component props
Required props
rowComponent: (props: { ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem"; }; index: number; style: CSSProperties; } & RowProps) => ReactNode
React component responsible for rendering a row.

This component will receive an index and style prop by default. Additionally it will receive prop values passed to rowProps.

⚠️ The prop types for this component are exported as RowComponentProps
rowCount: number
Number of items to be rendered in the list.
rowHeight: string | number | ((index: number, cellProps: RowProps) => number)
Row height; the following formats are supported:
• number of pixels (number)
• percentage of the grid's current height (string)
• function that returns the row height (in pixels) given an index and cellProps
rowProps: ExcludeForbiddenKeys<RowProps>
Additional props to be passed to the row-rendering component. List will automatically re-render rows when values in this object change.

⚠️ This object must not contain either an index or style prop.
Optional props
children?: ReactNode
Additional content to be rendered within the list (above cells). This property can be used to render things like overlays or tooltips.
className?: string | undefined
CSS class name.
defaultHeight?: number | undefined = 0
Default height of list for initial render. This value is important for server rendering.
listRef?: Ref<ListImperativeAPI> | undefined
Ref used to interact with this component's imperative API.

This API has imperative methods for scrolling and a getter for the outermost DOM element.

⚠️ The useListRef and useListCallbackRef hooks are exported for convenience use in TypeScript projects.
onResize?: ((size: { height: number; width: number; }, prevSize: { height: number; width: number; }) => void) | undefined
Callback notified when the List's outermost HTMLElement resizes. This may be used to (re)scroll a row into view.
onRowsRendered?: ((visibleRows: { startIndex: number; stopIndex: number; }, allRows: { startIndex: number; stopIndex: number; }) => void) | undefined
Callback notified when the range of visible rows changes.
overscanCount?: number | undefined = 3
How many additional rows to render outside of the visible area. This can reduce visual flickering near the edges of a list when scrolling.
style?: CSSProperties | undefined
Optional CSS properties. The list of rows will fill the height defined by this style.
tagName?: keyof IntrinsicElements | undefined = "div" as TagName
Can be used to override the root HTML element rendered by the List component. The default value is "div", meaning that List renders an HTMLDivElement as its root.

⚠️ In most use cases the default ARIA roles are sufficient and this prop is not needed.
Continue to imperative api…

Lists
Imperative API
List provides an imperative API for responding to events. The recommended way to access this API is to use the exported ref hook:
import { useListRef } from "react-window";
Attach the ref during render:
function Example(props: Props) {
const listRef = useListRef(null);
return <List listRef={listRef} {...props} />;
}
And call API methods in an event handler:
const onClick = () => {
const list = listRef.current;
list?.scrollToRow({
align: "auto", // optional
behavior: "auto", // optional
index: 250
});
};
The form below uses the imperative API to scroll the list:

Align

Scroll behavior

State
Scroll
Alabama
1 of 4838
Alabaster, 35007
2 of 4838
Athens, 35611
3 of 4838
Athens, 35613
4 of 4838
Auburn, 36830
5 of 4838
Bessemer, 35020
6 of 4838
Birmingham, 35209
7 of 4838
Birmingham, 35215
8 of 4838
Birmingham, 35216
9 of 4838
Note If you are passing the ref to another component or hook, use the ref callback function instead.
import { useListCallbackRef } from "react-window";
function Example(props: Props) {
const [list, setList] = useListCallbackRef(null);
useCustomHook(list);
return <List listRef={setList} {...props} />;
}
Continue to ARIA roles…

Lists
ARIA roles
The ARIA list role can be used to identify a list of items.
<div role="list">
<div
role="listitem"
aria-posinset="1"
aria-setsize="1000"
>
Row 1
</div>
<div
role="listitem"
aria-posinset="2"
aria-setsize="1000"
>
Row 2
</div>
<!-- More rows ... -->
</div>
The List component automatically adds this role to the root HTMLDivElement it renders, but because individual rows are rendered by your code- you must assign ARIA attributes to those elements.
To simplify this, the recommended ARIA attributes are passed to the rowComponent in the form of the ariaAttributes prop. The easiest way to use them is just to pass them through like so:
import { type RowComponentProps } from "react-window";
function RowComponent({
ariaAttributes,
names,
index,
style
}: RowComponentProps<{
names: string[];
}>) {
return (
<div style={style} {...ariaAttributes}>
{names[index]}
</div>
);
}

Tables
Rendering tabular data
Many types of tabular data can be rendered using the list component.
City
State
Zip
Abbeville
Louisiana
70510
Aberdeen
South Dakota
57401
Abilene
Texas
79601
Abilene
Texas
79605
Abilene
Texas
79606
Abingdon
Maryland
21009
Absecon
New Jersey
8205
Acworth
Georgia
30101
Acworth
Georgia
30102
The example above uses Flexbox layout to position columns and headers.
import { getScrollbarSize, List, type RowComponentProps } from "react-window";
function Example({ addresses }: { addresses: Address[] }) {
const [size] = useState(getScrollbarSize);
return (
<div className="h-55 flex flex-col">
<div className="flex flex-row bg-teal-600 p-1 px-2">
<div className="grow flex flex-row items-center gap-2 font-bold">
<div className="flex-1">City</div>
<div className="flex-1">State</div>
<div className="w-10">Zip</div>
</div>
<div className="shrink" style={{ width: size }} />
</div>
<div className="overflow-hidden">
<List
rowComponent={RowComponent}
rowCount={addresses.length}
rowHeight={25}
rowProps={{ addresses }}
/>
</div>
</div>
);
}
function RowComponent({
index,
addresses,
style
}: RowComponentProps<{
addresses: Address[];
}>) {
const address = addresses[index];
return (
<div className="flex flex-row items-center gap-2 px-2" style={style}>
<div className="flex-1">{address.city}</div>
<div className="flex-1">{address.state}</div>
<div className="w-10 text-xs">{address.zip}</div>
</div>
);
}
It may be more efficient to render data with many columns using the Grid component.
Continue to ARIA roles…

Tables
ARIA roles
The default ARIA role set by the List component is list , but the table role is more appropriate for tabular data.
<div role="table" aria-colcount="3" aria-rowcount="1000">
<div role="row" aria-rowindex="1">
<div role="columnheader" aria-colindex="1">City</div>
<div role="columnheader" aria-colindex="2">State</div>
<div role="columnheader" aria-colindex="3">Zip</div>
</div>
<div role="row" aria-rowindex="2">
<div role="cell" aria-colindex="1" />
<div role="cell" aria-colindex="2" />
<div role="cell" aria-colindex="3" />
</div>
<!-- More rows ... -->
</div>
The example on the previous page can be modified like so to assign the correct ARIA attributes:
import { List, type RowComponentProps } from "react-window";
function Example() {
return (
<div role="table" aria-colcount={3} aria-rowcount={1000}>
<div role="row" aria-rowindex={1}>
<div role="columnheader" aria-colindex={1}>
City
</div>
<div role="columnheader" aria-colindex={1}>
State
</div>
<div role="columnheader" aria-colindex={1}>
Zip
</div>
</div>
<List role="rowgroup" {...otherListProps} />
</div>
);
}
function RowComponent({ index, style }: RowComponentProps<object>) {
// Add 1 to the row index to account for the header row
return (
<div aria-rowindex={index + 1} role="row" style={style}>
<div role="cell" aria-colindex={1}>
...
</div>
<div role="cell" aria-colindex={2}>
...
</div>
<div role="cell" aria-colindex={3}>
...
</div>
</div>
);
}

Grids
Rendering a grid
Use the Grid component to render data with many rows and columns:
DrAlgernonRobersarobers1q@pinterest.comMale16 Ludington PlazaSan Luis ObispoCalifornia93407
DrAntonettaGwiltagwilt1e@sitemeter.comFemale0 Butternut ParkSan Luis ObispoCalifornia93407
DrBeniaminoWorlidgebworlidge5g@google.plMale7620 Hovde StreetSeattleWashington98175
DrBinkyCurnowbcurnow5@stanford.eduMale2868 Main WayScottsdaleArizona85271
DrBobbyeDobelbdobel6d@twitter.comFemale4 Chinook TerraceBuffaloNew York14233
DrBordyWhalebwhale19@bloglovin.comMale76705 Bowman JunctionWashingtonDistrict of Columbia20057
DrBroddyBilsfordbbilsford7c@toplist.czPolygender0042 Swallow CourtPortlandOregon97255
DrCatleeEsslemontcesslemont18@army.milFemale120 Muir StreetRaleighNorth Carolina27615
Grids require you to specify the number of rows and columns as well as the width and height of each:
import { Grid } from "react-window";
function Example({ contacts }: { contacts: Contact[] }) {
return (
<Grid
cellComponent={CellComponent}
cellProps={{ contacts }}
columnCount={10}
columnWidth={columnWidth}
rowCount={contacts.length}
rowHeight={25}
/>
);
}
Column widths and row heights can be either numbers or functions. In the example above, row height is fixed and column width is function that determines the width of the column based on the column index:
function columnWidth(index: number) {
switch (indexToColumn(index)) {
case "address": {
return 250;
}
case "email": {
return 300;
}
case "job_title": {
return 150;
}
case "timezone": {
return 200;
}
case "zip": {
return 75;
}
default: {
return 100;
}
}
}
Lastly grids require a component to render cell, given a column and row index. As with lists, this component receives additional props specified as part of cellProps:
import { type CellComponentProps } from "react-window";
function CellComponent({
contacts,
columnIndex,
rowIndex,
style
}: CellComponentProps<{
contacts: Contact[];
}>) {
const address = contacts[rowIndex];
const content = address[indexToColumn(columnIndex)];
return (
<div className="truncate" style={style}>
{content}
</div>
);
}
Grids require space to render cells. Typically the ResizeObserver API is used to determine how much space there is available within the parent DOM element.
If an explicit width and height are specified (in pixels) using the style prop, ResizeObserver will not be used.
Continue to component props…


Grids
Component props
Required props
cellComponent: (props: { ariaAttributes: { "aria-colindex": number; role: "gridcell"; }; columnIndex: number; rowIndex: number; style: CSSProperties; } & CellProps) => ReactNode
React component responsible for rendering a cell.

This component will receive an index and style prop by default. Additionally it will receive prop values passed to cellProps.

⚠️ The prop types for this component are exported as CellComponentProps
cellProps: ExcludeForbiddenKeys<CellProps>
Additional props to be passed to the cell-rendering component. Grid will automatically re-render cells when values in this object change.

⚠️ This object must not contain either an index or style prop.
columnCount: number
Number of columns to be rendered in the grid.
columnWidth: string | number | ((index: number, cellProps: CellProps) => number)
Column width; the following formats are supported:
• number of pixels (number)
• percentage of the grid's current width (string)
• function that returns the row width (in pixels) given an index and cellProps
rowCount: number
Number of rows to be rendered in the grid.
rowHeight: string | number | ((index: number, cellProps: CellProps) => number)
Row height; the following formats are supported:
• number of pixels (number)
• percentage of the grid's current height (string)
• function that returns the row height (in pixels) given an index and cellProps
Optional props
children?: ReactNode
Additional content to be rendered within the grid (above cells). This property can be used to render things like overlays or tooltips.
className?: string | undefined
CSS class name.
defaultHeight?: number | undefined = 0
Default height of grid for initial render. This value is important for server rendering.
defaultWidth?: number | undefined = 0
Default width of grid for initial render. This value is important for server rendering.
dir?: string | undefined
Corresponds to the HTML dir attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir
gridRef?: Ref<GridImperativeAPI> | undefined
Ref used to interact with this component's imperative API.

This API has imperative methods for scrolling and a getter for the outermost DOM element.

⚠️ The useGridRef and useGridCallbackRef hooks are exported for convenience use in TypeScript projects.
onCellsRendered?: ((visibleCells: { columnStartIndex: number; columnStopIndex: number; rowStartIndex: number; rowStopIndex: number; }, allCells: { columnStartIndex: number; columnStopIndex: number; rowStartIndex: number; rowStopIndex: number; }) => void) | undefined
Callback notified when the range of rendered cells changes.
onResize?: ((size: { height: number; width: number; }, prevSize: { height: number; width: number; }) => void) | undefined
Callback notified when the Grid's outermost HTMLElement resizes. This may be used to (re)scroll a cell into view.
overscanCount?: number | undefined = 3
How many additional rows/columns to render outside of the visible area. This can reduce visual flickering near the edges of a grid when scrolling.
style?: CSSProperties | undefined
Optional CSS properties. The grid of cells will fill the height and width defined by this style.
tagName?: keyof IntrinsicElements | undefined = "div" as TagName
Can be used to override the root HTML element rendered by the List component. The default value is "div", meaning that List renders an HTMLDivElement as its root.

⚠️ In most use cases the default ARIA roles are sufficient and this prop is not needed.
Continue to imperative api…


Grids
Imperative API
Grid provides an imperative API for responding to events. The recommended way to access this API is to use the exported ref hook:
import { useGridRef } from "react-window";
Attach the ref during render:
function Example(props: Props) {
const gridRef = useGridRef(null);
return <Grid gridRef={gridRef} {...props} />;
}
And call API methods in an event handler:
const onClick = () => {
const grid = gridRef.current;
grid?.scrollToCell({
behavior: "auto", // optional
columnAlign: "auto", // optional
columnIndex: 10,
rowAlign: "auto", // optional
rowIndex: 250
});
};
The form below uses the imperative API to scroll the list:

Align

Scroll behavior

Job title

Column
Scroll
DrAlgernonRobersarobers1q@pinterest.comMale16 Ludington PlazaSan Luis ObispoCalifornia93407
DrAntonettaGwiltagwilt1e@sitemeter.comFemale0 Butternut ParkSan Luis ObispoCalifornia93407
DrBeniaminoWorlidgebworlidge5g@google.plMale7620 Hovde StreetSeattleWashington98175
DrBinkyCurnowbcurnow5@stanford.eduMale2868 Main WayScottsdaleArizona85271
DrBobbyeDobelbdobel6d@twitter.comFemale4 Chinook TerraceBuffaloNew York14233
DrBordyWhalebwhale19@bloglovin.comMale76705 Bowman JunctionWashingtonDistrict of Columbia20057
DrBroddyBilsfordbbilsford7c@toplist.czPolygender0042 Swallow CourtPortlandOregon97255
DrCatleeEsslemontcesslemont18@army.milFemale120 Muir StreetRaleighNorth Carolina27615
The Grid API also provides scrollToColumn and scrollToRow methods for single-axis scrolling.
Note If you are passing the ref to another component or hook, use the ref callback function instead.
import { useGridCallbackRef } from "react-window";
function Example(props: Props) {
const [grid, setGrid] = useGridCallbackRef(null);
useCustomHook(grid);
return <Grid gridRef={setGrid} {...props} />;
}
Continue to ARIA roles…

Grids
ARIA roles
The ARIA grid role can be used to identify an element that contains one or more rows of cells.
<div role="grid" aria-colcount="100" aria-rowcount="1000">
<div role="row" aria-rowindex="0">
<div role="gridcell" aria-colindex="0" />
<div role="gridcell" aria-colindex="1" />
<!-- More columns ... -->
</div>
<!-- More rows ... -->
</div>
The Grid component automatically adds this role to the root HTMLDivElement it renders, but because individual cells are rendered by your code- you must assign ARIA attributes to those elements.
To simplify this, the recommended ARIA attributes are passed to the cellComponent in the form of the ariaAttributes prop. The easiest way to use them is just to pass them through like so:
import { type CellComponentProps } from "react-window";
function CellComponent({
ariaAttributes,
columnIndex,
rowIndex,
style
}: CellComponentProps<object>) {
return (
<div style={style} {...ariaAttributes}>
{/* Data */}
</div>
);
}


Grids can also display right to left languages (like Arabic). The grid components check the dir attribute to determine content directionality.
Using the same data as from the previous example, here is a grid rendered right to left.
Dr
row 0, col 0
Algernon
row 0, col 1
Robers
row 0, col 2
arobers1q@pinterest.com
row 0, col 3
Male
row 0, col 4
16 Ludington Plaza
row 0, col 5
San Luis Obispo
row 0, col 6
California
row 0, col 7
93407
row 0, col 8
Dr
row 1, col 0
Antonetta
row 1, col 1
Gwilt
row 1, col 2
agwilt1e@sitemeter.com
row 1, col 3
Female
row 1, col 4
0 Butternut Park
row 1, col 5
San Luis Obispo
row 1, col 6
California
row 1, col 7
93407
row 1, col 8
Dr
row 2, col 0
Beniamino
row 2, col 1
Worlidge
row 2, col 2
bworlidge5g@google.pl
row 2, col 3
Male
row 2, col 4
7620 Hovde Street
row 2, col 5
Seattle
row 2, col 6
Washington
row 2, col 7
98175
row 2, col 8
Dr
row 3, col 0
Binky
row 3, col 1
Curnow
row 3, col 2
bcurnow5@stanford.edu
row 3, col 3
Male
row 3, col 4
2868 Main Way
row 3, col 5
Scottsdale
row 3, col 6
Arizona
row 3, col 7
85271
row 3, col 8
Dr
row 4, col 0
Bobbye
row 4, col 1
Dobel
row 4, col 2
bdobel6d@twitter.com
row 4, col 3
Female
row 4, col 4
4 Chinook Terrace
row 4, col 5
Buffalo
row 4, col 6
New York
row 4, col 7
14233
row 4, col 8
Dr
row 5, col 0
Bordy
row 5, col 1
Whale
row 5, col 2
bwhale19@bloglovin.com
row 5, col 3
Male
row 5, col 4
76705 Bowman Junction
row 5, col 5
Washington
row 5, col 6
District of Columbia
row 5, col 7
20057
row 5, col 8
Dr
row 6, col 0
Broddy
row 6, col 1
Bilsford
row 6, col 2
bbilsford7c@toplist.cz
row 6, col 3
Polygender
row 6, col 4
0042 Swallow Court
row 6, col 5
Portland
row 6, col 6
Oregon
row 6, col 7
97255
row 6, col 8
import { Grid } from "react-window";
function RtlExample({ contacts }: { contacts: Contact[] }) {
return (
<Grid
cellComponent={CellComponent}
cellProps={{ contacts }}
columnCount={10}
columnWidth={columnWidth}
dir="rtl"
rowCount={contacts.length}
rowHeight={35}
/>
);
}


A horizontal list is just a grid with only one row.
Here's an example horizontal list (grid) of emails:
abacon52@time.comabiasini11@stanford.eduagarett6e@unblog.fragwilt1e@sitemeter.comajekel58@unblog.franewbigging5f@prnewswire.comapeters7j@amazon.comapietrusiak5y@cnet.comapywell1r@mysql.com
Here's what the configuration for the grid above looks like:
import { Grid } from "react-window";
function HorizontalList({ emails }: { emails: string[] }) {
return (
<Grid
cellComponent={CellComponent}
cellProps={{ emails }}
columnCount={emails.length}
columnWidth={150}
rowCount={1}
rowHeight="100%"
/>
);
}
And here's the cell renderer:
import { type CellComponentProps } from "react-window";
function CellComponent({
columnIndex,
emails,
style
}: CellComponentProps<{ emails: string[] }>) {
return (
<div
className={cn("px-2 truncate text-center leading-[2.5]", {
"bg-white/10 rounded": columnIndex % 2 === 0
})}
style={style}
>
{emails[columnIndex]}
</div>
);
}


Other
Sticky rows
If you want to render content on top of your list or grid, the safest method is to use a portal and render them directly into the parent document. This avoids potential clipping issues or z-index conflicts.
For the specific case of "sticky" rows, you can render within the parent list or grid using the children prop:
Row 1Row 2Row 3Row 4Row 5Row 6Row 7Row 8Row 9
Sticky header
The example above was created using code like this:
import { List, type RowComponentProps } from "react-window";
function Example() {
return (
<List
rowComponent={RowComponent}
rowCount={101}
rowHeight={20}
rowProps={EMPTY_OBJECT}
>
<div className="w-full h-0 top-0 sticky">
<div className="h-[20px] bg-teal-600 px-2 rounded">Sticky header</div>
</div>
</List>
);
}
Note the height of 0 in the example above prevents the sticky row from affecting the height of the parent list.


equirements
This library requires React version 18 or newer.
It also uses the ResizeObserver (or a polyfill) to calculate the available space for List and Grid components.
ResizeObserver usage can be avoided if explicit pixel dimensions are specified using the style prop. (Percentage or EM/REM based dimensions do not count.)


Support
GitHub is the easiest place to look for help, but it's probably not the fastest. This project is maintained by a single developer so there is limited bandwidth for answering questions.
I recommend asking questions on Stack Overflow or Reddit to start with. Both sites have active communities who often respond quickly. If you don't find an answer there you can try opening a GitHub issue- but please take a moment first to see if your question has has already been answered before opening a new one.