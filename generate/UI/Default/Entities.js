// Module import examples - none are required:
// import webRequest from 'UI/Functions/WebRequest';
// import Loop from 'UI/Loop';

export default class Entities extends React.Component {
	
	/*
	// If you want to use state in your react component, uncomment this constructor:
	constructor(props){
		super(props);
		this.state = {
		};
		
		// example of how to reference this within a function
		//this.clickHandler = this.clickHandler.bind(this);
	}
	*/

	/*
	clickHandler(event) {
		this.setState({
		});
	}
	*/
	
	render(){
		// reference propTypes
		//var { title, size, width } = this.props;
		
		return <div className="fully-qualified-entity">
		</div>;
		
	}
	
}

/*
// propTypes are used to describe configuration on your component in the editor.
// Just setting it to an empty object will make your component appear as something that can be added.
// Define your available props like the examples below.

Entities.propTypes = {
	title: 'string', // text input
	size: [1,2,3,4], // dropdowns
	width: [ // dropdown with separate labels/values
		{ name: '1/12', value: 1 },
		{ name: '2/12', value: 2 },
		{ name: '3/12 (25%)', value: 3 },
		{ name: '4/12 (33%)', value: 4 },
		{ name: '5/12', value: 5 },
		{ name: '6/12 (50%)', value: 6 },
		{ name: '7/12', value: 7 },
		{ name: '8/12 (66%)', value: 8 },
		{ name: '9/12 (75%)', value: 9 },
		{ name: '10/12', value: 10 },
		{ name: '11/12', value: 11 },
		{ name: '12/12 (100%)', value: 12 }
	],
	
	// All <Input type='x' /> values are supported - checkbox, color etc.
	// Also the special id type which can be used to select some other piece of content (by entity name), like this:
	templateToUse: {type: 'id', content: 'Template'}
};

// use defaultProps to define default values, if required
Entities.defaultProps = {
	title: "Example string",
	size: 1,
	width: 6	
}

// icon used to represent component when adding to a page via /en-admin/page
// see https://fontawesome.com/icons?d=gallery for available classnames
// NB: exclude the "fa-" prefix
Entities.icon='align-center'; // fontawesome icon
*/