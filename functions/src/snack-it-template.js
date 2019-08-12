export const postTemplate = `<sergey-import src="review">
  <sergey-template name="title">
    ##TITLE##
  </sergey-template>

  <sergey-template name="taste">##TASTESCORE##</sergey-template>
  <sergey-template name="presentation">##PRESENTSCORE##</sergey-template>
  <sergey-template name="value">##VFMSCORE##</sergey-template>
  
  <sergey-template name="author">##AUTHOR##</sergey-template>

  <sergey-template name="content">
    <h2>Taste</h2>

    <p>
      ##TASTEBODY##
    </p>

    <h2>Presentation</h2>

    <p>
      ##PRESENTBODY##
    </p>

    <h2>Value for Money</h2>

    <p>
      ##VFMBODY##
    </p>
  </sergey-template>
</sergey-import>`;

export const listTemplate = `<li>
  <a href="/##SLUG##/">##TITLE##</a>
</li>`;
