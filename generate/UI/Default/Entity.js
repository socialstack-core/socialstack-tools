// Module import examples - none are required:
// import webRequest from 'UI/Functions/WebRequest';
// import Loop from 'UI/Loop';

export default class Entity extends React.Component {
	
	render(){
		
		return <div className="entity"></div>;
		
	}
	
}

/*
// propTypes are used to describe configuration on your component in the editor.
// Just setting it to an empty object will make your component appear as something that can be added.
// Define your available props like the examples below.

Entity.propTypes = {
	
	title: 'string', // text input
	size: [1,2,3,4], // dropdowns
	
	// All <Input type='x' /> values are supported - checkbox, color etc.
	// Also the special id type which can be used to select some other piece of content (by entity name), like this:
	templateToUse: {type: 'id', content: 'Template'}
	
};

Entity.icon='align-center'; // fontawesome icon
*/