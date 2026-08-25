import CategoryCard from "./CategoryCard.jsx";

/**
 * Todas as categorias na mesma tela, em qualquer ordem (spec 9).
 * Nao existe wizard obrigatorio.
 */
export function CategoryList({ categories, answers, currentId, disabled, onSelect }) {
  return (
    <ul className="categories">
      {categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          value={answers[category.id] ?? ""}
          current={category.id === currentId}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

export default CategoryList;
