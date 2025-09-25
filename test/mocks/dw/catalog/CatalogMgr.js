'use strict';

/**
 * Mock CatalogMgr for testing category processing strategies
 */

var mockCatalogData = null;

function setMockCatalogData(data) {
    mockCatalogData = data;
}

function createMockCategory(id, name, children, parent) {
    return {
        getID: function () { return id; },
        getDisplayName: function () { return name; },
        getSubCategories: function () { return children || []; },
        getParent: function () { return parent || null; }
    };
}

function createLargeCatalogMock(totalCategories) {
    var categories = {};
    var rootChildren = [];
    var categoryCount = 0;

    // Create a balanced tree structure
    var levelsDeep = Math.ceil(Math.log(totalCategories) / Math.log(4)); // 4 children per category
    var categoriesPerLevel = Math.ceil(totalCategories / levelsDeep);

    function createCategoryTree(parentId, parentName, level, maxLevel) {
        if (level >= maxLevel || categoryCount >= totalCategories) {
            return [];
        }

        var children = [];
        var childrenCount = Math.min(4, Math.ceil((totalCategories - categoryCount) / (maxLevel - level)));

        for (var i = 0; i < childrenCount && categoryCount < totalCategories; i++) {
            categoryCount++;
            var childId = parentId ? parentId + '_' + i : 'cat_' + i;
            var childName = parentName ? parentName + ' > Sub ' + i : 'Category ' + i;

            var grandChildren = createCategoryTree(childId, childName, level + 1, maxLevel);
            var category = createMockCategory(childId, 'Category ' + categoryCount, grandChildren, null);
            
            categories[childId] = category;
            children.push(category);
        }

        return children;
    }

    rootChildren = createCategoryTree(null, null, 0, levelsDeep);

    var rootCategory = createMockCategory('root', 'Root Category', rootChildren, null);
    categories.root = rootCategory;

    return {
        categories: categories,
        root: rootCategory,
        totalCount: categoryCount
    };
}

var CatalogMgr = {
    getSiteCatalog: function () {
        if (mockCatalogData) {
            return {
                getRoot: function () {
                    return mockCatalogData.root;
                }
            };
        }

        // Default small catalog for normal tests
        var cat1 = createMockCategory('cat1', 'Electronics', [], null);
        var cat2 = createMockCategory('cat2', 'Clothing', [], null);
        var root = createMockCategory('root', 'Root', [cat1, cat2], null);

        return {
            getRoot: function () { return root; }
        };
    },

    getCategory: function (categoryId) {
        if (mockCatalogData && mockCatalogData.categories[categoryId]) {
            return mockCatalogData.categories[categoryId];
        }

        // Return a mock category for tree traversal tests
        return createMockCategory(categoryId, 'Mock Category ' + categoryId, [], null);
    }
};

// Test utilities
CatalogMgr.__testUtils = {
    setMockCatalogData: setMockCatalogData,
    createLargeCatalogMock: createLargeCatalogMock,
    createMockCategory: createMockCategory,
    reset: function () {
        mockCatalogData = null;
    }
};

module.exports = CatalogMgr;
