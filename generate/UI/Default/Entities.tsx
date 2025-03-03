/**
 * Props for the Entities component.
 */
interface EntitiesProps {
	/**
	 * An example optional fileRef prop.
	 */
	// logoRef?: FileRef
}

/**
 * The Entities React component.
 * @param props React props.
 */
const Entities: React.FC<EntitiesProps> = (props) => {
	return (
		<div className="fully-qualified-entity">
		</div>
	);
}

export default Entities;