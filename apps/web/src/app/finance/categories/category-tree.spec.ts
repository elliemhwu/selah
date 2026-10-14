import type { CategoryDto } from '../data/finance-api';
import { categoryTree, categoryWithDescendants } from './category-tree';

const category = (id: string, parentId: string | null = null) => ({ id, name: id, parentId, sortOrder: 0 }) as CategoryDto;

describe('categoryTree', () => {
  it('puts subcategories under their parent, keeping the API order among siblings', () => {
    // The API sorts by sort order, then name: a child can come before its parent.
    const tree = categoryTree([category('Coffee', 'Food'), category('Food'), category('Lunch', 'Food'), category('Travel'), category('Bento', 'Lunch')]);
    expect(tree.map((c) => [c.name, c.depth])).toEqual([
      ['Food', 0],
      ['Coffee', 1],
      ['Lunch', 1],
      ['Bento', 2],
      ['Travel', 0],
    ]);
  });

  it('shows a category whose parent is missing at the top level', () => {
    expect(categoryTree([category('Lunch', 'gone')]).map((c) => [c.name, c.depth])).toEqual([['Lunch', 0]]);
  });

  it('still shows every category of a broken tree with a loop', () => {
    const tree = categoryTree([category('A', 'B'), category('B', 'A'), category('C')]);
    expect(tree.map((c) => c.name).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('categoryWithDescendants', () => {
  it('collects the category and everything under it', () => {
    const list = [category('Bento', 'Lunch'), category('Food'), category('Lunch', 'Food'), category('Travel')];
    expect([...categoryWithDescendants(list, 'Food')].sort()).toEqual(['Bento', 'Food', 'Lunch']);
    expect([...categoryWithDescendants(list, 'Travel')]).toEqual(['Travel']);
  });
});
